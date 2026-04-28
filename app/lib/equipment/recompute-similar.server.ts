import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryOption } from "~/lib/categories.server";
import { Logger, createLogContext, type LogContext } from "~/lib/logger.server";
import {
  bucketKey,
  computeSimilarity,
  type SimilarityOptions,
} from "./similarity";

export interface RecomputeEquipment {
  id: string;
  category: string;
  subcategory: string | null;
  specifications: Record<string, unknown>;
}

export interface RecomputeReview {
  equipment_id: string;
  category_ratings: Record<string, unknown> | null;
}

export interface RecomputeInput {
  equipment: RecomputeEquipment[];
  reviews: RecomputeReview[];
  specFields: CategoryOption[];
  options?: SimilarityOptions;
}

export interface SimilarRow {
  equipment_id: string;
  similar_equipment_id: string;
  score: number;
  rank: number;
}

export interface RecomputeResult {
  equipmentProcessed: number;
  pairsWritten: number;
  durationMs: number;
  // ISO timestamp stamped on every row written this run — same value the
  // status indicator's MAX(computed_at) query reads back.
  runStart: string;
}

const UPSERT_CHUNK_SIZE = 500;

function averageReviewRatings(
  reviews: RecomputeReview[]
): Map<string, Record<string, number>> {
  const sums = new Map<string, Map<string, { sum: number; count: number }>>();

  for (const review of reviews) {
    const ratings = review.category_ratings;
    if (!ratings || typeof ratings !== "object") continue;
    let perKey = sums.get(review.equipment_id);
    if (!perKey) {
      perKey = new Map();
      sums.set(review.equipment_id, perKey);
    }
    for (const [k, v] of Object.entries(ratings)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      let bucket = perKey.get(k);
      if (!bucket) {
        bucket = { sum: 0, count: 0 };
        perKey.set(k, bucket);
      }
      bucket.sum += v;
      bucket.count += 1;
    }
  }

  const result = new Map<string, Record<string, number>>();
  for (const [id, perKey] of sums) {
    const avg: Record<string, number> = {};
    for (const [k, { sum, count }] of perKey) {
      if (count > 0) avg[k] = sum / count;
    }
    if (Object.keys(avg).length > 0) result.set(id, avg);
  }
  return result;
}

/**
 * Pure transformation: equipment + reviews + spec-field metadata → rows ready
 * to upsert into equipment_similar. Separated from I/O so it's unit-testable.
 *
 * Spec fields are applied uniformly across every bucket present in the input —
 * the algorithm only consumes a field when both items in a pair carry that
 * key in their JSONB, so over-supplying does no harm.
 */
export function buildSimilarRows(input: RecomputeInput): SimilarRow[] {
  const reviewAverages = averageReviewRatings(input.reviews);

  const specFieldsMap = new Map<string, CategoryOption[]>();
  for (const item of input.equipment) {
    const key = bucketKey(item.category, item.subcategory);
    if (!specFieldsMap.has(key)) specFieldsMap.set(key, input.specFields);
  }

  const similar = computeSimilarity({
    equipment: input.equipment,
    reviewAverages,
    specFields: specFieldsMap,
    options: input.options,
  });

  const rows: SimilarRow[] = [];
  for (const [equipmentId, pairs] of similar) {
    for (const pair of pairs) {
      rows.push({
        equipment_id: equipmentId,
        similar_equipment_id: pair.id,
        score: pair.score,
        rank: pair.rank,
      });
    }
  }
  return rows;
}

async function fetchEquipment(
  client: SupabaseClient
): Promise<RecomputeEquipment[]> {
  const { data, error } = await client
    .from("equipment")
    .select("id, category, subcategory, specifications");
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: String(row.id),
    category: String(row.category),
    subcategory: row.subcategory == null ? null : String(row.subcategory),
    specifications:
      row.specifications && typeof row.specifications === "object"
        ? (row.specifications as Record<string, unknown>)
        : {},
  }));
}

async function fetchApprovedReviews(
  client: SupabaseClient
): Promise<RecomputeReview[]> {
  const { data, error } = await client
    .from("equipment_reviews")
    .select("equipment_id, category_ratings")
    .eq("status", "approved");
  if (error) throw error;
  return (data ?? []).map(row => ({
    equipment_id: String(row.equipment_id),
    category_ratings:
      row.category_ratings && typeof row.category_ratings === "object"
        ? (row.category_ratings as Record<string, unknown>)
        : null,
  }));
}

async function fetchSpecFields(
  client: SupabaseClient
): Promise<CategoryOption[]> {
  const { data, error } = await client
    .from("categories")
    .select(
      "id, name, value, display_order, field_type, unit, scale_min, scale_max"
    )
    .eq("type", "equipment_spec_field")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: String(row.id),
    name: String(row.name),
    value: String(row.value),
    display_order: Number(row.display_order ?? 0),
    field_type: row.field_type ?? undefined,
    unit: row.unit ?? undefined,
    scale_min: row.scale_min ?? undefined,
    scale_max: row.scale_max ?? undefined,
  }));
}

/**
 * Recompute the equipment_similar table. Idempotent: re-running stamps every
 * fresh row with `computed_at = runStart`, then prunes any leftover row whose
 * `computed_at` predates the current run (these are stale entries that fell
 * out of top-N or whose source equipment was deleted between runs).
 *
 * Caller (admin route or scheduled handler) provides a service-role Supabase
 * client so the upsert and delete bypass RLS.
 */
export async function recomputeSimilarEquipment(
  client: SupabaseClient,
  ctxLog: LogContext = createLogContext("recompute-similar")
): Promise<RecomputeResult> {
  const startedAt = Date.now();
  const runStart = new Date(startedAt);

  Logger.info("recompute-similar.start", ctxLog);

  const [equipment, reviews, specFields] = await Promise.all([
    fetchEquipment(client),
    fetchApprovedReviews(client),
    fetchSpecFields(client),
  ]);

  const rows = buildSimilarRows({ equipment, reviews, specFields });

  const stampedRows = rows.map(r => ({
    ...r,
    computed_at: runStart.toISOString(),
  }));

  for (let i = 0; i < stampedRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = stampedRows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await client
      .from("equipment_similar")
      .upsert(chunk, { onConflict: "equipment_id,similar_equipment_id" });
    if (error) throw error;
  }

  const { error: pruneError } = await client
    .from("equipment_similar")
    .delete()
    .lt("computed_at", runStart.toISOString());
  if (pruneError) throw pruneError;

  const durationMs = Date.now() - startedAt;
  const result: RecomputeResult = {
    equipmentProcessed: equipment.length,
    pairsWritten: rows.length,
    durationMs,
    runStart: runStart.toISOString(),
  };

  Logger.info("recompute-similar.done", ctxLog, result);

  return result;
}

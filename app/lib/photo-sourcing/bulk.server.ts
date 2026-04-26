// Bulk-source orchestrator (TT-53). Walks the equipment table for rows
// that have never been sourced (no image_key, not skipped, no
// previous attempt) and feeds them through the per-item pipeline.
// Throttled to roughly 1 req/sec to honour Brave's free tier.
//
// Chunked rather than long-running: the Worker has a 30s wall-clock
// limit, so we accept ~CHUNK_SIZE items per call and let the caller
// (admin UI) re-invoke until `remaining` is zero. Idempotent — the
// `image_sourcing_attempted_at` flag set by sourcePhotosForEquipment
// keeps the same row from being re-scanned across calls.
//
// Auto-pick: if a sourcing run yields exactly one trailing candidate
// at tier ≤ 2 (top + mid retailers), promote it without going through
// the review queue. Cuts admin click load for the obvious matches.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourcePhotosForEquipment,
  type SourcingEnv,
  type SourcingResult,
} from "./source.server";
import { pickCandidate } from "./review.server";
import {
  deleteImageFromCloudflare,
  type CloudflareImagesEnv,
} from "../images/cloudflare";

export const DEFAULT_CHUNK_SIZE = 5;
export const DEFAULT_BRAVE_GAP_MS = 1100;
const AUTO_PICK_TIER_THRESHOLD = 2;

export interface BulkSourceOptions {
  chunkSize?: number;
  braveGapMs?: number;
  // Defaults to setTimeout-based wait; overridable for tests.
  sleep?: (ms: number) => Promise<void>;
  // Defaults to the lib's source helper; overridable for tests.
  sourceFn?: typeof sourcePhotosForEquipment;
  // Defaults to the lib's pick helper; overridable for tests.
  pickFn?: typeof pickCandidate;
  // Defaults to the lib's CF Images delete; overridable for tests.
  deleteCfImage?: (env: CloudflareImagesEnv, id: string) => Promise<void>;
}

export interface BulkSourceResult {
  scanned: number;
  autoPicked: number;
  candidatesCreated: number;
  unresolved: number;
  remaining: number;
  errors: Array<{ slug: string; message: string }>;
}

interface QueueRow {
  id: string;
  slug: string;
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

// Process one chunk of unimaged equipment. Re-invoke until
// `remaining === 0` to drain the queue completely.
export async function bulkSourcePhotos(
  supabase: SupabaseClient,
  env: SourcingEnv,
  triggeredBy: string,
  options: BulkSourceOptions = {}
): Promise<BulkSourceResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const gap = options.braveGapMs ?? DEFAULT_BRAVE_GAP_MS;
  const sleep = options.sleep ?? defaultSleep;
  const sourceFn = options.sourceFn ?? sourcePhotosForEquipment;
  const pickFn = options.pickFn ?? pickCandidate;
  const deleteCfImage = options.deleteCfImage ?? deleteImageFromCloudflare;

  const { count, error: countError } = await supabase
    .from("equipment")
    .select("id", { count: "exact", head: true })
    .is("image_key", null)
    .is("image_skipped_at", null)
    .is("image_sourcing_attempted_at", null);
  if (countError) {
    throw new Error(`bulk-source count failed: ${countError.message}`);
  }
  const totalRemaining = count ?? 0;

  if (totalRemaining === 0) {
    return {
      scanned: 0,
      autoPicked: 0,
      candidatesCreated: 0,
      unresolved: 0,
      remaining: 0,
      errors: [],
    };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("equipment")
    .select("id, slug")
    .is("image_key", null)
    .is("image_skipped_at", null)
    .is("image_sourcing_attempted_at", null)
    .order("category", { ascending: true })
    .order("manufacturer", { ascending: true })
    .order("name", { ascending: true })
    .limit(chunkSize);

  if (rowsError) {
    throw new Error(`bulk-source list failed: ${rowsError.message}`);
  }

  const chunk = (rows ?? []) as QueueRow[];

  let autoPicked = 0;
  let candidatesCreated = 0;
  let unresolved = 0;
  const errors: BulkSourceResult["errors"] = [];

  for (let i = 0; i < chunk.length; i += 1) {
    const row = chunk[i];
    if (i > 0) await sleep(gap);

    let result: SourcingResult;
    try {
      result = await sourceFn(supabase, env, row.slug);
    } catch (err) {
      errors.push({
        slug: row.slug,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (result.status === "no-candidates") {
      unresolved += 1;
      continue;
    }
    if (result.status === "already-imaged") {
      // Race: someone picked between count and list. Skip.
      continue;
    }

    const trailingTopTier = result.candidates.filter(
      c => c.match_kind === "trailing" && c.tier <= AUTO_PICK_TIER_THRESHOLD
    );
    if (trailingTopTier.length === 1) {
      try {
        await pickFn(
          supabase,
          env,
          {
            equipmentId: result.equipment.id,
            candidateId: trailingTopTier[0].id,
            pickedBy: triggeredBy,
          },
          { deleteCfImage }
        );
        autoPicked += 1;
        continue;
      } catch (err) {
        // Auto-pick failed — fall through to "left in queue".
        errors.push({
          slug: row.slug,
          message: `auto-pick failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    candidatesCreated += result.insertedCount;
  }

  return {
    scanned: chunk.length,
    autoPicked,
    candidatesCreated,
    unresolved,
    remaining: Math.max(0, totalRemaining - chunk.length),
    errors,
  };
}

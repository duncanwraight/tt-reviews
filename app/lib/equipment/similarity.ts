import type { CategoryOption } from "~/lib/categories.server";

export interface SimilarityEquipment {
  id: string;
  category: string;
  subcategory?: string | null;
  specifications: Record<string, unknown>;
}

export interface SimilarityOptions {
  topN?: number;
  reviewWeight?: number;
  manufacturerWeight?: number;
}

export interface SimilarPair {
  id: string;
  score: number;
  rank: number;
}

export interface SimilarityInput {
  equipment: SimilarityEquipment[];
  reviewAverages: Map<string, Record<string, number>>;
  specFields: Map<string, CategoryOption[]>;
  options?: SimilarityOptions;
}

const DEFAULTS = {
  topN: 6,
  reviewWeight: 1.0,
  manufacturerWeight: 0.5,
} as const;

interface Attribute {
  value: number;
  weight: number;
}

type AttributeMap = Map<string, Attribute>;

/**
 * Bucket key shared between callers. Equipment with the same (category, subcategory)
 * pair are compared against each other; items in different buckets never compare.
 */
export function bucketKey(
  category: string,
  subcategory?: string | null
): string {
  return `${category}|${subcategory ?? ""}`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readNumericSpec(
  value: unknown,
  fieldType: string | undefined
): number | null {
  if (fieldType === "int" || fieldType === "float") {
    return isFiniteNumber(value) ? value : null;
  }
  if (fieldType === "range") {
    if (
      value &&
      typeof value === "object" &&
      "min" in value &&
      "max" in value
    ) {
      const { min, max } = value as { min: unknown; max: unknown };
      if (isFiniteNumber(min) && isFiniteNumber(max)) {
        return (min + max) / 2;
      }
    }
    return null;
  }
  return null;
}

/**
 * Compute top-N similar equipment per item.
 *
 * Algorithm: per (category, subcategory) bucket, build a unified attribute vector
 * per item from review-rating averages (weight 1.0) and numeric manufacturer specs
 * (weight 0.5). Min-max normalize each attribute across the bucket. Pairwise
 * weighted Euclidean distance over the *intersection* of attributes both sides
 * have — items missing an attribute simply don't contribute it to the pair.
 * Score = 1 / (1 + distance) so higher = more similar.
 *
 * Pure: no DB, no I/O. Caller (TT-70 worker job) supplies pre-fetched snapshots.
 */
export function computeSimilarity(
  input: SimilarityInput
): Map<string, SimilarPair[]> {
  const { equipment, reviewAverages, specFields, options } = input;
  const topN = options?.topN ?? DEFAULTS.topN;
  const reviewWeight = options?.reviewWeight ?? DEFAULTS.reviewWeight;
  const manufacturerWeight =
    options?.manufacturerWeight ?? DEFAULTS.manufacturerWeight;

  const buckets = new Map<string, SimilarityEquipment[]>();
  for (const item of equipment) {
    const key = bucketKey(item.category, item.subcategory);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  const result = new Map<string, SimilarPair[]>();

  for (const [key, items] of buckets) {
    if (items.length < 2) continue;
    const fields = specFields.get(key) ?? [];

    const rawAttrs = new Map<string, AttributeMap>();
    for (const item of items) {
      const attrs: AttributeMap = new Map();

      const review = reviewAverages.get(item.id);
      if (review) {
        for (const [k, v] of Object.entries(review)) {
          if (isFiniteNumber(v)) {
            attrs.set(`review:${k}`, { value: v, weight: reviewWeight });
          }
        }
      }

      for (const field of fields) {
        const ft = field.field_type;
        if (ft !== "int" && ft !== "float" && ft !== "range") continue;
        const raw = item.specifications[field.value];
        const num = readNumericSpec(raw, ft);
        if (num !== null) {
          attrs.set(`manuf:${field.value}`, {
            value: num,
            weight: manufacturerWeight,
          });
        }
      }

      rawAttrs.set(item.id, attrs);
    }

    const minMax = new Map<string, { min: number; max: number }>();
    for (const attrs of rawAttrs.values()) {
      for (const [k, { value }] of attrs) {
        const mm = minMax.get(k);
        if (!mm) {
          minMax.set(k, { min: value, max: value });
        } else {
          if (value < mm.min) mm.min = value;
          if (value > mm.max) mm.max = value;
        }
      }
    }

    const normAttrs = new Map<string, AttributeMap>();
    for (const [id, attrs] of rawAttrs) {
      const norm: AttributeMap = new Map();
      for (const [k, { value, weight }] of attrs) {
        const mm = minMax.get(k);
        if (!mm) continue;
        const range = mm.max - mm.min;
        // Constant attribute across the bucket carries no signal — every pair
        // sees diff=0, so the chosen constant doesn't matter.
        const nv = range === 0 ? 0.5 : (value - mm.min) / range;
        norm.set(k, { value: nv, weight });
      }
      normAttrs.set(id, norm);
    }

    const ids = items.map(e => e.id);
    for (let i = 0; i < ids.length; i++) {
      const a = normAttrs.get(ids[i]);
      if (!a) continue;
      const candidates: Array<{ id: string; score: number }> = [];
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const b = normAttrs.get(ids[j]);
        if (!b) continue;
        let sumSq = 0;
        let sharedCount = 0;
        for (const [k, av] of a) {
          const bv = b.get(k);
          if (!bv) continue;
          const diff = av.value - bv.value;
          sumSq += av.weight * diff * diff;
          sharedCount++;
        }
        if (sharedCount === 0) continue;
        const distance = Math.sqrt(sumSq);
        const score = 1 / (1 + distance);
        candidates.push({ id: ids[j], score });
      }
      if (candidates.length === 0) continue;
      candidates.sort((x, y) => y.score - x.score);
      const top = candidates.slice(0, topN).map((c, idx) => ({
        id: c.id,
        score: c.score,
        rank: idx + 1,
      }));
      result.set(ids[i], top);
    }
  }

  return result;
}

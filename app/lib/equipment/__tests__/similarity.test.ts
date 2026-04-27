import { describe, it, expect } from "vitest";
import type { CategoryOption } from "~/lib/categories.server";
import {
  bucketKey,
  computeSimilarity,
  type SimilarityEquipment,
  type SimilarityInput,
} from "../similarity";

function specField(
  value: string,
  field_type: CategoryOption["field_type"]
): CategoryOption {
  return { id: value, name: value, value, field_type, display_order: 0 };
}

function eq(
  id: string,
  category: string,
  subcategory: string | null,
  specifications: Record<string, unknown> = {}
): SimilarityEquipment {
  return { id, category, subcategory, specifications };
}

function run(
  input: Partial<SimilarityInput> & {
    equipment: SimilarityEquipment[];
  }
) {
  return computeSimilarity({
    reviewAverages: input.reviewAverages ?? new Map(),
    specFields: input.specFields ?? new Map(),
    options: input.options,
    equipment: input.equipment,
  });
}

describe("computeSimilarity — bucket boundaries", () => {
  it("returns empty result for an empty bucket", () => {
    const result = run({ equipment: [] });
    expect(result.size).toBe(0);
  });

  it("returns empty result when a bucket has only one item", () => {
    const result = run({
      equipment: [eq("a", "blade", null, { weight: 80 })],
      specFields: new Map([
        [bucketKey("blade", null), [specField("weight", "int")]],
      ]),
    });
    expect(result.size).toBe(0);
  });

  it("does not compare across buckets — different category", () => {
    const result = run({
      equipment: [
        eq("a", "blade", null),
        eq("b", "rubber", "inverted"),
        eq("c", "blade", null),
      ],
      reviewAverages: new Map([
        ["a", { speed: 8 }],
        ["b", { speed: 8 }],
        ["c", { speed: 9 }],
      ]),
    });
    expect(result.get("a")?.map(p => p.id)).toEqual(["c"]);
    expect(result.get("b")).toBeUndefined();
  });

  it("does not compare across buckets — different subcategory", () => {
    const result = run({
      equipment: [
        eq("a", "rubber", "inverted"),
        eq("b", "rubber", "long_pips"),
        eq("c", "rubber", "inverted"),
      ],
      reviewAverages: new Map([
        ["a", { speed: 5 }],
        ["b", { speed: 5 }],
        ["c", { speed: 6 }],
      ]),
    });
    expect(result.get("a")?.map(p => p.id)).toEqual(["c"]);
    expect(result.get("b")).toBeUndefined();
  });
});

describe("computeSimilarity — signal sources", () => {
  it("review-only: ranks closest review averages first", () => {
    const result = run({
      equipment: [
        eq("target", "blade", null),
        eq("near", "blade", null),
        eq("far", "blade", null),
      ],
      reviewAverages: new Map([
        ["target", { speed: 8, control: 7 }],
        ["near", { speed: 8.2, control: 7.1 }],
        ["far", { speed: 4, control: 3 }],
      ]),
    });
    const ranking = result.get("target")?.map(p => p.id);
    expect(ranking).toEqual(["near", "far"]);
  });

  it("manufacturer-only: ranks closest numeric specs first", () => {
    const result = run({
      equipment: [
        eq("target", "blade", null, { weight: 85, thickness: 5.7 }),
        eq("near", "blade", null, { weight: 86, thickness: 5.8 }),
        eq("far", "blade", null, { weight: 70, thickness: 7.0 }),
      ],
      specFields: new Map([
        [
          bucketKey("blade", null),
          [specField("weight", "int"), specField("thickness", "float")],
        ],
      ]),
    });
    const ranking = result.get("target")?.map(p => p.id);
    expect(ranking).toEqual(["near", "far"]);
  });

  it("range field: uses midpoint for comparison", () => {
    const result = run({
      equipment: [
        eq("target", "rubber", "inverted", { hardness: { min: 36, max: 40 } }),
        eq("near", "rubber", "inverted", { hardness: { min: 37, max: 39 } }),
        eq("far", "rubber", "inverted", { hardness: { min: 50, max: 52 } }),
      ],
      specFields: new Map([
        [bucketKey("rubber", "inverted"), [specField("hardness", "range")]],
      ]),
    });
    const ranking = result.get("target")?.map(p => p.id);
    expect(ranking).toEqual(["near", "far"]);
  });

  it("mixed signal: combines review and manufacturer attributes", () => {
    const result = run({
      equipment: [
        eq("target", "blade", null, { weight: 85 }),
        eq("near", "blade", null, { weight: 85 }),
        eq("far", "blade", null, { weight: 50 }),
      ],
      reviewAverages: new Map([
        ["target", { speed: 8 }],
        ["near", { speed: 8 }],
        ["far", { speed: 8 }],
      ]),
      specFields: new Map([
        [bucketKey("blade", null), [specField("weight", "int")]],
      ]),
    });
    const ranking = result.get("target")?.map(p => p.id);
    expect(ranking).toEqual(["near", "far"]);
  });
});

describe("computeSimilarity — missing data", () => {
  it("drops candidates with zero shared attributes", () => {
    const result = run({
      equipment: [eq("target", "blade", null), eq("loner", "blade", null)],
      reviewAverages: new Map<string, Record<string, number>>([
        ["target", { speed: 8 }],
        ["loner", { control: 5 }],
      ]),
    });
    expect(result.get("target")).toBeUndefined();
    expect(result.get("loner")).toBeUndefined();
  });

  it("ignores text-typed manufacturer fields", () => {
    const result = run({
      equipment: [
        eq("target", "blade", null, { material: "Limba" }),
        eq("other", "blade", null, { material: "Hinoki" }),
      ],
      specFields: new Map([
        [bucketKey("blade", null), [specField("material", "text")]],
      ]),
    });
    expect(result.get("target")).toBeUndefined();
  });

  it("ignores non-finite manufacturer values", () => {
    const result = run({
      equipment: [
        eq("target", "blade", null, { weight: "85g" }),
        eq("other", "blade", null, { weight: NaN }),
      ],
      specFields: new Map([
        [bucketKey("blade", null), [specField("weight", "int")]],
      ]),
    });
    expect(result.get("target")).toBeUndefined();
  });

  it("attribute present in only one item is not used by the pair", () => {
    // Both have `speed`. Only `target` has `control`. The pair compares only `speed`.
    // Without the intersection rule, missing `control` could collapse to a phantom 0.
    const result = run({
      equipment: [eq("target", "blade", null), eq("near", "blade", null)],
      reviewAverages: new Map<string, Record<string, number>>([
        ["target", { speed: 8, control: 7 }],
        ["near", { speed: 8 }],
      ]),
    });
    const targetPairs = result.get("target");
    expect(targetPairs?.length).toBe(1);
    // speed identical → distance 0 → score 1.0.
    expect(targetPairs?.[0].score).toBeCloseTo(1.0, 5);
  });
});

describe("computeSimilarity — normalization", () => {
  it("normalizes per-bucket, not globally", () => {
    // Bucket A spec values are 1..2, bucket B values are 100..200. After per-bucket
    // normalization, both buckets see relative spacing that depends only on their
    // own range, so the closer pair within each bucket should win.
    const result = run({
      equipment: [
        eq("a1", "blade", null, { weight: 1 }),
        eq("a2", "blade", null, { weight: 2 }),
        eq("a3", "blade", null, { weight: 1.1 }),
        eq("b1", "rubber", "inverted", { weight: 100 }),
        eq("b2", "rubber", "inverted", { weight: 200 }),
        eq("b3", "rubber", "inverted", { weight: 110 }),
      ],
      specFields: new Map([
        [bucketKey("blade", null), [specField("weight", "int")]],
        [bucketKey("rubber", "inverted"), [specField("weight", "int")]],
      ]),
    });
    expect(result.get("a1")?.[0].id).toBe("a3");
    expect(result.get("b1")?.[0].id).toBe("b3");
  });

  it("constant attribute across the bucket contributes no signal", () => {
    // weight is identical for all items, so it should not affect ranking.
    const result = run({
      equipment: [
        eq("target", "blade", null, { weight: 85 }),
        eq("near", "blade", null, { weight: 85 }),
        eq("far", "blade", null, { weight: 85 }),
      ],
      reviewAverages: new Map([
        ["target", { speed: 8 }],
        ["near", { speed: 8.1 }],
        ["far", { speed: 4 }],
      ]),
      specFields: new Map([
        [bucketKey("blade", null), [specField("weight", "int")]],
      ]),
    });
    expect(result.get("target")?.map(p => p.id)).toEqual(["near", "far"]);
  });
});

describe("computeSimilarity — options", () => {
  it("topN limits the number of candidates returned", () => {
    const equipment: SimilarityEquipment[] = Array.from(
      { length: 10 },
      (_, i) => eq(`x${i}`, "blade", null)
    );
    const reviewAverages = new Map(
      equipment.map((item, i) => [item.id, { speed: i }])
    );
    const result = computeSimilarity({
      equipment,
      reviewAverages,
      specFields: new Map(),
      options: { topN: 3 },
    });
    expect(result.get("x0")?.length).toBe(3);
    expect(result.get("x0")?.map(p => p.rank)).toEqual([1, 2, 3]);
  });

  it("default topN is 6", () => {
    const equipment: SimilarityEquipment[] = Array.from(
      { length: 10 },
      (_, i) => eq(`x${i}`, "blade", null)
    );
    const reviewAverages = new Map(
      equipment.map((item, i) => [item.id, { speed: i }])
    );
    const result = computeSimilarity({
      equipment,
      reviewAverages,
      specFields: new Map(),
    });
    expect(result.get("x0")?.length).toBe(6);
  });

  it("manufacturerWeight changes ranking when only manuf attrs differ", () => {
    // target review speed 8, both candidates review speed 8 (tied on review).
    // candA matches target exactly on weight; candB diverges on weight.
    // Default (manufWeight=0.5): candA wins (closer manuf).
    // manufWeight=0: ranking by review only — both candidates tie on review,
    //   so we can't assert a flip here, but we can show distance changes.
    const equipment: SimilarityEquipment[] = [
      eq("target", "blade", null, { weight: 80 }),
      eq("a", "blade", null, { weight: 80 }),
      eq("b", "blade", null, { weight: 100 }),
    ];
    const reviewAverages = new Map([
      ["target", { speed: 8 }],
      ["a", { speed: 8 }],
      ["b", { speed: 8 }],
    ]);
    const specFields = new Map([
      [bucketKey("blade", null), [specField("weight", "int")]],
    ]);

    const heavy = computeSimilarity({
      equipment,
      reviewAverages,
      specFields,
      options: { manufacturerWeight: 1.0 },
    });
    const light = computeSimilarity({
      equipment,
      reviewAverages,
      specFields,
      options: { manufacturerWeight: 0.1 },
    });

    const heavyB = heavy.get("target")?.find(p => p.id === "b");
    const lightB = light.get("target")?.find(p => p.id === "b");
    expect(heavyB).toBeDefined();
    expect(lightB).toBeDefined();
    // Heavier manuf weight → larger distance for "b" → lower score.
    expect(heavyB!.score).toBeLessThan(lightB!.score);
  });

  it("ranks output with ascending rank starting at 1", () => {
    const result = run({
      equipment: [
        eq("a", "blade", null),
        eq("b", "blade", null),
        eq("c", "blade", null),
      ],
      reviewAverages: new Map([
        ["a", { speed: 5 }],
        ["b", { speed: 6 }],
        ["c", { speed: 9 }],
      ]),
    });
    const ranks = result.get("a")?.map(p => p.rank);
    expect(ranks).toEqual([1, 2]);
  });
});

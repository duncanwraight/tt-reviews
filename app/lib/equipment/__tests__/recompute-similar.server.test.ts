import { describe, it, expect } from "vitest";
import type { CategoryOption } from "~/lib/categories.server";
import {
  buildSimilarRows,
  type RecomputeEquipment,
  type RecomputeReview,
} from "../recompute-similar.server";

function eq(
  id: string,
  category: string,
  subcategory: string | null,
  specifications: Record<string, unknown> = {}
): RecomputeEquipment {
  return { id, category, subcategory, specifications };
}

function review(
  equipmentId: string,
  ratings: Record<string, number>
): RecomputeReview {
  return { equipment_id: equipmentId, category_ratings: ratings };
}

function specField(
  value: string,
  field_type: CategoryOption["field_type"]
): CategoryOption {
  return { id: value, name: value, value, field_type, display_order: 0 };
}

describe("buildSimilarRows", () => {
  it("returns empty when no equipment", () => {
    expect(
      buildSimilarRows({ equipment: [], reviews: [], specFields: [] })
    ).toEqual([]);
  });

  it("emits one row per (equipment_id, rank) pair, ranks ascending", () => {
    const rows = buildSimilarRows({
      equipment: [
        eq("a", "blade", null),
        eq("b", "blade", null),
        eq("c", "blade", null),
      ],
      reviews: [
        review("a", { speed: 8 }),
        review("b", { speed: 8.1 }),
        review("c", { speed: 4 }),
      ],
      specFields: [],
    });

    const aRows = rows.filter(r => r.equipment_id === "a");
    expect(aRows.map(r => r.similar_equipment_id)).toEqual(["b", "c"]);
    expect(aRows.map(r => r.rank)).toEqual([1, 2]);
    expect(aRows[0].score).toBeGreaterThan(aRows[1].score);
  });

  it("averages multiple reviews per equipment before ranking", () => {
    const rows = buildSimilarRows({
      equipment: [
        eq("target", "blade", null),
        eq("avg", "blade", null),
        eq("far", "blade", null),
      ],
      reviews: [
        review("target", { speed: 8 }),
        // avg's average is 8.0; matching target exactly.
        review("avg", { speed: 6 }),
        review("avg", { speed: 10 }),
        review("far", { speed: 2 }),
      ],
      specFields: [],
    });

    const top = rows.find(r => r.equipment_id === "target" && r.rank === 1);
    expect(top?.similar_equipment_id).toBe("avg");
  });

  it("ignores non-finite values inside category_ratings", () => {
    const rows = buildSimilarRows({
      equipment: [eq("a", "blade", null), eq("b", "blade", null)],
      reviews: [
        review("a", { speed: 8 }),
        // NaN must not poison the average.
        { equipment_id: "b", category_ratings: { speed: NaN, control: 5 } },
        // String inside ratings — silently dropped.
        {
          equipment_id: "b",
          category_ratings: { speed: "garbage" } as unknown as Record<
            string,
            number
          >,
        },
        review("b", { speed: 8 }),
      ],
      specFields: [],
    });

    const aRow = rows.find(r => r.equipment_id === "a");
    expect(aRow?.similar_equipment_id).toBe("b");
    expect(aRow?.score).toBeCloseTo(1, 5);
  });

  it("uses manufacturer specs alongside review data", () => {
    const rows = buildSimilarRows({
      equipment: [
        eq("target", "blade", null, { weight: 85, thickness: 5.7 }),
        eq("near", "blade", null, { weight: 86, thickness: 5.8 }),
        eq("far", "blade", null, { weight: 60, thickness: 7.0 }),
      ],
      reviews: [],
      specFields: [specField("weight", "int"), specField("thickness", "float")],
    });

    const target = rows
      .filter(r => r.equipment_id === "target")
      .sort((a, b) => a.rank - b.rank);
    expect(target.map(r => r.similar_equipment_id)).toEqual(["near", "far"]);
  });

  it("does not pair items across (category, subcategory) buckets", () => {
    const rows = buildSimilarRows({
      equipment: [
        eq("blade1", "blade", null),
        eq("blade2", "blade", null),
        eq("rubber1", "rubber", "inverted"),
        eq("rubber2", "rubber", "inverted"),
      ],
      reviews: [
        review("blade1", { speed: 8 }),
        review("blade2", { speed: 8 }),
        review("rubber1", { speed: 8 }),
        review("rubber2", { speed: 8 }),
      ],
      specFields: [],
    });

    const blade1 = rows.find(r => r.equipment_id === "blade1");
    expect(blade1?.similar_equipment_id).toBe("blade2");
    const rubber1 = rows.find(r => r.equipment_id === "rubber1");
    expect(rubber1?.similar_equipment_id).toBe("rubber2");
    expect(rows.length).toBe(4);
  });

  it("handles range-typed manufacturer specs via midpoint", () => {
    const rows = buildSimilarRows({
      equipment: [
        eq("a", "rubber", "inverted", { hardness: { min: 36, max: 40 } }),
        eq("b", "rubber", "inverted", { hardness: { min: 38, max: 38 } }),
        eq("c", "rubber", "inverted", { hardness: { min: 50, max: 50 } }),
      ],
      reviews: [],
      specFields: [specField("hardness", "range")],
    });

    const a = rows.find(r => r.equipment_id === "a" && r.rank === 1);
    expect(a?.similar_equipment_id).toBe("b");
  });

  it("drops equipment with no shared attributes from any candidate", () => {
    const rows = buildSimilarRows({
      equipment: [eq("a", "blade", null), eq("b", "blade", null)],
      reviews: [review("a", { speed: 8 }), review("b", { control: 5 })],
      specFields: [],
    });

    expect(rows.length).toBe(0);
  });

  it("treats null category_ratings as no review signal", () => {
    const rows = buildSimilarRows({
      equipment: [eq("a", "blade", null), eq("b", "blade", null)],
      reviews: [
        { equipment_id: "a", category_ratings: null },
        { equipment_id: "b", category_ratings: null },
      ],
      specFields: [],
    });

    expect(rows.length).toBe(0);
  });
});

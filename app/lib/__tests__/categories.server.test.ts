import { describe, it, expect, vi } from "vitest";
import { CategoryService } from "../categories.server";

/**
 * Pins the getEquipmentSpecFields method added for TT-28.
 * Mirrors the shape of getReviewRatingCategories: subcategory wins over category,
 * unknown category returns [], no-arg delegates to the RPC used by getCategoriesByType.
 */

type Row = Record<string, unknown>;

interface StubOpts {
  rpcResult?: { data: Row[]; error: null };
  // Keyed by `${type}:${value}` e.g. "equipment_subcategory:inverted"
  singleByTypeValue?: Record<string, Row | null>;
  // Keyed by parent_id e.g. "blade-id"
  rowsByParentId?: Record<string, Row[]>;
}

function makeSupabaseStub(opts: StubOpts) {
  const rpc = vi
    .fn()
    .mockResolvedValue(opts.rpcResult ?? { data: [], error: null });

  const from = vi.fn(() => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.single = vi.fn(async () => {
      const key = `${filters.type as string}:${filters.value as string}`;
      const data = opts.singleByTypeValue?.[key] ?? null;
      return { data };
    });
    builder.order = vi.fn(async () => {
      const parentId = filters.parent_id as string;
      const data = opts.rowsByParentId?.[parentId] ?? [];
      return { data, error: null };
    });
    return builder;
  });

  return { supabase: { from, rpc }, rpc, from };
}

describe("CategoryService.getEquipmentSpecFields", () => {
  it("prefers subcategory parent when the subcategory resolves", async () => {
    const invertedFields = [
      { id: "sp-1", name: "Sponge", value: "sponge", display_order: 1 },
      { id: "sp-2", name: "Topsheet", value: "topsheet", display_order: 2 },
    ];
    const { supabase } = makeSupabaseStub({
      singleByTypeValue: {
        "equipment_subcategory:inverted": { id: "inverted-id" },
      },
      rowsByParentId: { "inverted-id": invertedFields },
    });

    const service = new CategoryService(supabase as any);
    const result = await service.getEquipmentSpecFields("rubber", "inverted");

    expect(result).toEqual(invertedFields);
  });

  it("uses the equipment_category parent when no subcategory provided", async () => {
    const bladeFields = [
      { id: "b-1", name: "Thickness", value: "thickness", display_order: 1 },
      { id: "b-2", name: "Plies", value: "plies", display_order: 2 },
    ];
    const { supabase } = makeSupabaseStub({
      singleByTypeValue: {
        "equipment_category:blade": { id: "blade-id" },
      },
      rowsByParentId: { "blade-id": bladeFields },
    });

    const service = new CategoryService(supabase as any);
    const result = await service.getEquipmentSpecFields("blade");

    expect(result).toEqual(bladeFields);
  });

  it("falls back to equipment_category when the subcategory is unknown", async () => {
    const rubberFields = [
      { id: "r-1", name: "Sponge", value: "sponge", display_order: 1 },
    ];
    const { supabase } = makeSupabaseStub({
      singleByTypeValue: {
        // subcategory 'bogus' missing → falls through to rubber
        "equipment_category:rubber": { id: "rubber-id" },
      },
      rowsByParentId: { "rubber-id": rubberFields },
    });

    const service = new CategoryService(supabase as any);
    const result = await service.getEquipmentSpecFields("rubber", "bogus");

    expect(result).toEqual(rubberFields);
  });

  it("returns [] when neither subcategory nor category resolves", async () => {
    const { supabase } = makeSupabaseStub({
      // No single lookups registered → both .single() calls return data: null
      rowsByParentId: {},
    });

    const service = new CategoryService(supabase as any);
    const result = await service.getEquipmentSpecFields("nonsense");

    expect(result).toEqual([]);
  });

  it("delegates to getCategoriesByType (RPC) when no args are provided", async () => {
    const allRows = [
      { id: "x-1", name: "Thickness", value: "thickness", display_order: 1 },
    ];
    const { supabase, rpc } = makeSupabaseStub({
      rpcResult: { data: allRows, error: null },
    });

    const service = new CategoryService(supabase as any);
    const result = await service.getEquipmentSpecFields();

    expect(result).toEqual(allRows);
    expect(rpc).toHaveBeenCalledWith("get_categories_by_type", {
      category_type_param: "equipment_spec_field",
    });
  });
});

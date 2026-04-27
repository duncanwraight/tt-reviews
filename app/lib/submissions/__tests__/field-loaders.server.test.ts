import { describe, it, expect } from "vitest";
import { loadFieldOptions } from "../field-loaders.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Locks in the equipment-submission spec metadata loader.
 *
 * The first attempt used a PostgREST self-FK embed
 * (`parent:categories!parent_id(value)`) — which silently returns
 * `parent: []` instead of erroring when the relationship can't resolve,
 * making "no spec fields ever appear in the form" the indistinguishable
 * failure mode. We now do two queries and join in JS; this test pins
 * that contract using a fake Supabase client.
 */

interface CategoryRow {
  id: string;
  name?: string;
  value: string;
  type: "equipment_category" | "equipment_subcategory" | "equipment_spec_field";
  is_active: boolean;
  display_order?: number;
  field_type?: "int" | "float" | "range" | "text";
  unit?: string;
  scale_min?: number;
  scale_max?: number;
  parent_id?: string | null;
}

function fakeSupabase(rows: CategoryRow[]): SupabaseClient {
  const filterRows = (
    type: string | string[],
    activeOnly: boolean
  ): CategoryRow[] => {
    const types = Array.isArray(type) ? type : [type];
    return rows.filter(
      r => types.includes(r.type) && (!activeOnly || r.is_active)
    );
  };

  // Minimal builder — only supports the chained calls the loader actually
  // uses. Each `from` returns a fresh accumulator so calls don't leak
  // state across queries.
  const from = (table: string) => {
    if (table !== "categories") {
      throw new Error(`unexpected table: ${table}`);
    }
    let typeFilter: string[] | string | null = null;
    let activeOnly = false;
    const builder = {
      select(_: string) {
        return builder;
      },
      eq(col: string, val: string | boolean) {
        if (col === "type") typeFilter = val as string;
        if (col === "is_active") activeOnly = val === true;
        return builder;
      },
      in(col: string, vals: string[]) {
        if (col === "type") typeFilter = vals;
        return builder;
      },
      match(filters: Record<string, unknown>) {
        if (typeof filters.type === "string") typeFilter = filters.type;
        if (filters.is_active === true) activeOnly = true;
        return builder;
      },
      order(_: string) {
        return builder;
      },
      // Awaitable: the loader uses `await sbClient.from(...).select(...).eq(...)`
      // with no terminal call.
      then(resolve: (value: { data: CategoryRow[]; error: null }) => void) {
        const data = filterRows(typeFilter ?? "", activeOnly);
        resolve({ data, error: null });
      },
    };
    return builder;
  };

  return { from } as unknown as SupabaseClient;
}

describe("loadFieldOptions(equipment) — spec_fields_by_parent", () => {
  it("groups spec fields by parent.value via id→value join", async () => {
    const bladeId = "blade-uuid";
    const invertedId = "inverted-uuid";
    const result = await loadFieldOptions(
      "equipment",
      fakeSupabase([
        {
          id: bladeId,
          value: "blade",
          type: "equipment_category",
          is_active: true,
        },
        {
          id: invertedId,
          value: "inverted",
          type: "equipment_subcategory",
          is_active: true,
        },
        {
          id: "thickness-uuid",
          name: "Thickness",
          value: "thickness",
          type: "equipment_spec_field",
          is_active: true,
          field_type: "float",
          unit: "mm",
          parent_id: bladeId,
          display_order: 0,
        },
        {
          id: "weight-uuid",
          name: "Weight",
          value: "weight",
          type: "equipment_spec_field",
          is_active: true,
          field_type: "int",
          unit: "g",
          parent_id: bladeId,
          display_order: 1,
        },
        {
          id: "hardness-uuid",
          name: "Hardness",
          value: "hardness",
          type: "equipment_spec_field",
          is_active: true,
          field_type: "range",
          parent_id: invertedId,
          display_order: 0,
        },
      ])
    );

    const grouped = result.spec_fields_by_parent;
    expect(grouped).toBeDefined();
    expect(Object.keys(grouped!).sort()).toEqual(["blade", "inverted"]);
    expect(grouped!.blade.map(f => f.value).sort()).toEqual([
      "thickness",
      "weight",
    ]);
    expect(grouped!.inverted).toEqual([
      expect.objectContaining({ value: "hardness", field_type: "range" }),
    ]);
  });

  it("skips spec_field rows whose parent_id doesn't resolve", async () => {
    // Defensive: a spec_field pointing at a missing/inactive parent
    // shouldn't crash the loader or attach to a phantom group.
    const result = await loadFieldOptions(
      "equipment",
      fakeSupabase([
        {
          id: "orphan-uuid",
          value: "ghost",
          type: "equipment_spec_field",
          is_active: true,
          field_type: "int",
          parent_id: "missing-parent",
        },
      ])
    );
    expect(result.spec_fields_by_parent).toEqual({});
  });
});

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyEquipmentEdit } from "../equipment-edit-applier.server";

/**
 * Hand-rolled minimal supabase stub for the applier's read/update
 * patterns:
 *   - from("equipment_edits").select("*").eq("id", X).single() → edit row
 *   - from("equipment").select("*").eq("id", X).single()       → equipment row
 *   - from("equipment").update(updates).eq("id", X)            → captured
 *   - from("equipment").select("id").eq("slug", S).neq("id", X).maybeSingle() → slug uniqueness
 *   - from("categories")...                                    → spec field metadata
 */
interface StubState {
  edit: Record<string, unknown> & { id: string; equipment_id: string };
  equipment: Record<string, unknown> & { id: string };
  // Slugs that are taken by *other* equipment rows (excludeId is the
  // applier's own equipment_id).
  takenSlugs?: string[];
  // Spec fields by parent value, mirroring CategoryService.getEquipmentSpecFields.
  specFieldsByParent?: Record<string, Array<{ value: string }>>;
}

interface CapturedUpdate {
  table: string;
   
  updates: Record<string, any>;
   
  filter: { col: string; value: any };
}

function makeStub(state: StubState) {
  const updates: CapturedUpdate[] = [];

  function from(table: string) {
    if (table === "equipment_edits") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () => ({ data: state.edit, error: null }),
              };
            },
          };
        },
      };
    }
    if (table === "equipment") {
      return {
        select(cols: string) {
          if (cols === "id") {
            // Slug uniqueness lookup: select id, eq slug, neq id, maybeSingle.
            return {
              eq(_col: string, slug: string) {
                return {
                  neq(_neqCol: string, _excludeId: string) {
                    return {
                      maybeSingle: async () =>
                        state.takenSlugs?.includes(slug)
                          ? { data: { id: "other" }, error: null }
                          : { data: null, error: null },
                    };
                  },
                };
              },
            };
          }
          // Equipment row read.
          return {
            eq(_col: string, _id: string) {
              return {
                single: async () => ({ data: state.equipment, error: null }),
              };
            },
          };
        },
         
        update(payload: Record<string, any>) {
          return {
             
            eq(col: string, value: any) {
              updates.push({ table, updates: payload, filter: { col, value } });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }
    if (table === "categories") {
      // Spec field metadata for createCategoryService.getEquipmentSpecFields.
      // Implementation does several queries: subcategory id, category id,
      // then the fields. Return shapes that satisfy each.
      let resolveValue: string | null = null;
      const builder: Record<string, unknown> = {
        select(_cols: string) {
          return builder;
        },
        eq(col: string, value: string) {
          if (col === "value") resolveValue = value;
          return builder;
        },
        order(_col: string) {
          // Final spec-fields query
          if (
            state.specFieldsByParent &&
            resolveValue !== null &&
            state.specFieldsByParent[resolveValue]
          ) {
            // The actual flow filters on parent_id, but we shortcut:
            // when select returns the fields' query, the resolveValue
            // captured was the parent's `value`.
            return Promise.resolve({
              data: state.specFieldsByParent[resolveValue].map(f => ({
                ...f,
                id: `id-${f.value}`,
                name: f.value,
                display_order: 0,
                field_type: "text",
                unit: null,
                scale_min: null,
                scale_max: null,
              })),
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        single: async () => {
          // Returns the parent (subcategory or category) lookup result.
          // Use resolveValue as the id we just looked up.
          if (resolveValue) {
            return { data: { id: `id-${resolveValue}` }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    captured: updates,
  };
}

const makeBucket = (seedObj?: {
  contentType?: string;
  bytes?: ArrayBuffer;
}) => {
  const puts: Array<{ key: string; bytes: ArrayBuffer }> = [];
  const deletes: string[] = [];
  return {
    bucket: {
      get: vi.fn(async () => {
        if (!seedObj) return null;
        return {
          arrayBuffer: async () => seedObj.bytes ?? new ArrayBuffer(4),
          httpMetadata: { contentType: seedObj.contentType ?? "image/png" },
        };
      }),
      put: vi.fn(async (key: string, bytes: ArrayBuffer) => {
        puts.push({ key, bytes });
      }),
      delete: vi.fn(async (key: string) => {
        deletes.push(key);
      }),
    } as unknown as R2Bucket,
    puts,
    deletes,
  };
};

describe("applyEquipmentEdit", () => {
  it("applies scalar field changes verbatim", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: { description: "new copy" },
      },
      equipment: {
        id: "eq1",
        name: "Old",
        slug: "old",
        category: "blade",
        subcategory: null,
        description: "old copy",
        specifications: {},
      },
    });

    const res = await applyEquipmentEdit(stub.client, undefined, "e1");

    expect(res).toEqual({ success: true });
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].updates).toEqual({ description: "new copy" });
  });

  it("regenerates slug on name change with collision suffix", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: { name: "Butterfly Tenergy" },
      },
      equipment: {
        id: "eq1",
        name: "Butterfly Tinergy",
        slug: "butterfly-tinergy",
        category: "rubber",
        subcategory: "inverted",
        specifications: {},
      },
      takenSlugs: ["butterfly-tenergy"],
    });

    const res = await applyEquipmentEdit(stub.client, undefined, "e1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].updates.slug).toBe("butterfly-tenergy-2");
  });

  it("merges specifications and drops null-marked keys", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: {
          specifications: { speed: 9.5, hardness: null },
        },
      },
      equipment: {
        id: "eq1",
        slug: "x",
        name: "X",
        category: "rubber",
        subcategory: "inverted",
        specifications: { speed: 8, hardness: { min: 40, max: 42 }, spin: 10 },
      },
    });

    const res = await applyEquipmentEdit(stub.client, undefined, "e1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].updates.specifications).toEqual({
      speed: 9.5,
      spin: 10,
    });
  });

  it("returns success with no UPDATE when edit_data is empty", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: { edit_reason: "typo", image_action: "keep" },
      },
      equipment: {
        id: "eq1",
        slug: "x",
        name: "X",
        category: "blade",
        subcategory: null,
        specifications: {},
      },
    });

    const res = await applyEquipmentEdit(stub.client, undefined, "e1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("promotes staged image and queues old image for cleanup", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: {
          image_action: "replace",
          image_pending_key: "equipment/submission-abc/123.png",
        },
      },
      equipment: {
        id: "eq1",
        slug: "stiga-airoc",
        name: "Stiga Airoc",
        category: "rubber",
        subcategory: "inverted",
        specifications: {},
        image_key: "equipment/old/old.png",
      },
    });

    const r2 = makeBucket({ contentType: "image/png" });

    const res = await applyEquipmentEdit(stub.client, r2.bucket, "e1");

    expect(res.success).toBe(true);
    expect(r2.puts).toHaveLength(1);
    expect(r2.puts[0].key).toMatch(/^equipment\/stiga-airoc\/\d+\.png$/);
    // The applier deletes both old canonical and the staged key
    // post-update.
    expect(r2.deletes).toContain("equipment/old/old.png");
    expect(r2.deletes).toContain("equipment/submission-abc/123.png");
    expect(stub.captured[0].updates.image_key).toMatch(
      /^equipment\/stiga-airoc\/\d+\.png$/
    );
    expect(stub.captured[0].updates.image_credit_text).toBe(
      "community submission"
    );
  });

  it("aborts before any DB write when staged image is missing", async () => {
    const stub = makeStub({
      edit: {
        id: "e1",
        equipment_id: "eq1",
        edit_data: {
          image_action: "replace",
          image_pending_key: "equipment/submission-missing/123.png",
        },
      },
      equipment: {
        id: "eq1",
        slug: "x",
        name: "X",
        category: "rubber",
        subcategory: "inverted",
        specifications: {},
        image_key: "equipment/old/old.png",
      },
    });
    const r2 = makeBucket(undefined); // bucket.get returns null

    const res = await applyEquipmentEdit(stub.client, r2.bucket, "e1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Staged image not found/);
    expect(stub.captured).toHaveLength(0);
    expect(r2.puts).toHaveLength(0);
    expect(r2.deletes).toHaveLength(0);
  });
});

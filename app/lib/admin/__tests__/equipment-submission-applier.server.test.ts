import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyEquipmentSubmission } from "../equipment-submission-applier.server";

/**
 * Hand-rolled Supabase stub mirroring the
 * player-edit-applier.server.test.ts shape so future appliers' tests
 * stay visually parallel. Read/insert patterns:
 *   - from("equipment_submissions").select("*").eq("id", X).single() → submission
 *   - from("equipment").insert(...)                                  → captured
 */
interface StubState {
  submission: Record<string, unknown> & { id: string; name: string };
  readError?: { message: string };
  insertError?: { message: string };
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown>;
}

function makeStub(state: StubState) {
  const inserts: CapturedInsert[] = [];

  function from(table: string) {
    if (table === "equipment_submissions") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () =>
                  state.readError
                    ? { data: null, error: state.readError }
                    : { data: state.submission, error: null },
              };
            },
          };
        },
      };
    }
    if (table === "equipment") {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return Promise.resolve(
            state.insertError ? { error: state.insertError } : { error: null }
          );
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    captured: inserts,
  };
}

describe("applyEquipmentSubmission", () => {
  it("creates an equipment row with the submission fields and a generated slug", async () => {
    const stub = makeStub({
      submission: {
        id: "es1",
        name: "Stiga Airoc Astro M",
        manufacturer: "Stiga",
        category: "rubber",
        subcategory: "inverted",
        specifications: { speed: 9, spin: 9 },
        description: "Lively forehand rubber",
        image_key: "equipment/submission-abc/123.png",
      },
    });

    const res = await applyEquipmentSubmission(stub.client, "es1");

    expect(res).toEqual({ success: true });
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].table).toBe("equipment");
    expect(stub.captured[0].payload).toEqual({
      name: "Stiga Airoc Astro M",
      slug: "stiga-airoc-astro-m",
      manufacturer: "Stiga",
      category: "rubber",
      subcategory: "inverted",
      specifications: { speed: 9, spin: 9 },
      description: "Lively forehand rubber",
      image_key: "equipment/submission-abc/123.png",
    });
  });

  it("normalises slug from a name with punctuation and mixed case", async () => {
    const stub = makeStub({
      submission: {
        id: "es1",
        name: "Butterfly  Tenergy 05 (FX)!",
        manufacturer: "Butterfly",
        category: "rubber",
        subcategory: "inverted",
        specifications: {},
      },
    });

    const res = await applyEquipmentSubmission(stub.client, "es1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.slug).toBe("butterfly-tenergy-05-fx");
  });

  it("passes null subcategory through unchanged (blades have no subcategory)", async () => {
    const stub = makeStub({
      submission: {
        id: "es1",
        name: "DHS Hurricane Long 5",
        manufacturer: "DHS",
        category: "blade",
        subcategory: null,
        specifications: {},
      },
    });

    const res = await applyEquipmentSubmission(stub.client, "es1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.subcategory).toBeNull();
  });

  it("returns failure when the submission row is not found", async () => {
    const stub = makeStub({
      submission: { id: "es1", name: "Missing" },
      readError: { message: "no rows returned" },
    });

    const res = await applyEquipmentSubmission(stub.client, "es1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.captured).toHaveLength(0);
  });

  it("surfaces the equipment INSERT error (e.g. slug collision)", async () => {
    const stub = makeStub({
      submission: {
        id: "es1",
        name: "Existing Name",
        manufacturer: "X",
        category: "rubber",
        subcategory: "inverted",
        specifications: {},
      },
      insertError: {
        message:
          'duplicate key value violates unique constraint "equipment_slug_key"',
      },
    });

    const res = await applyEquipmentSubmission(stub.client, "es1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/duplicate key/);
    expect(stub.captured).toHaveLength(1);
  });
});

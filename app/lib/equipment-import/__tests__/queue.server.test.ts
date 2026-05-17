import { describe, expect, it, vi } from "vitest";

import {
  processOneEquipmentImport,
  type EquipmentImportMessage,
} from "../queue.server";

// TT-238: lock the per-message subrequest budget so a future refactor
// that re-introduces a SELECT before the INSERT regresses straight back
// into the 50-subrequest cap that motivated this fix. The processor is
// expected to make EXACTLY two Supabase JS calls per invocation:
//   1. equipment.upsert        — insert with ON CONFLICT (slug) DO NOTHING.
//   2. equipment_import_job_items.insert — write the per-item outcome.
// Anything more should be a deliberate design change with the cap kept
// in mind.

interface MockSupabaseState {
  upsertCount: number;
  upsertReturn: {
    error: { message: string; code?: string } | null;
    count: number | null;
  };
  itemInsertCount: number;
  itemInsertReturn: { error: { message: string; code?: string } | null };
  itemPayloads: Array<Record<string, unknown>>;
}

function buildMockSupabase(state: MockSupabaseState) {
  return {
    from(table: string) {
      if (table === "equipment") {
        return {
          upsert: vi.fn().mockImplementation(async () => {
            state.upsertCount++;
            return state.upsertReturn;
          }),
        };
      }
      if (table === "equipment_import_job_items") {
        return {
          insert: vi
            .fn()
            .mockImplementation(async (payload: Record<string, unknown>) => {
              state.itemInsertCount++;
              state.itemPayloads.push(payload);
              return state.itemInsertReturn;
            }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function baseMessage(
  over: Partial<EquipmentImportMessage> = {}
): EquipmentImportMessage {
  return {
    job_id: "11111111-1111-1111-1111-111111111111",
    slug: "butterfly-test-product",
    product: {
      name: "Butterfly Test Product",
      manufacturer: "Butterfly",
      category: "rubber",
      subcategory: "inverted",
      slug: "test-product",
      sourceUrl: "https://revspin.net/rubber/butterfly-test-product.html",
      specifications: { weight: "42g" },
    },
    subcategoryOverride: null,
    ...over,
  };
}

describe("processOneEquipmentImport", () => {
  it("inserts a fresh product + records a success item with 2 Supabase calls", async () => {
    const state: MockSupabaseState = {
      upsertCount: 0,
      upsertReturn: { error: null, count: 1 },
      itemInsertCount: 0,
      itemInsertReturn: { error: null },
      itemPayloads: [],
    };
    const supabase = buildMockSupabase(state);

    const outcome = await processOneEquipmentImport(
      supabase as never,
      baseMessage()
    );

    expect(outcome).toEqual({ status: "inserted" });
    expect(state.upsertCount).toBe(1);
    expect(state.itemInsertCount).toBe(1);
    expect(state.itemPayloads[0]).toMatchObject({
      job_id: "11111111-1111-1111-1111-111111111111",
      slug: "butterfly-test-product",
      product_name: "Butterfly Test Product",
      status: "success",
      message: null,
    });
  });

  it("treats count=0 (slug already existed) as a skip + records 'Already exists'", async () => {
    const state: MockSupabaseState = {
      upsertCount: 0,
      // ignoreDuplicates path: PostgREST returns no rows + count=0.
      upsertReturn: { error: null, count: 0 },
      itemInsertCount: 0,
      itemInsertReturn: { error: null },
      itemPayloads: [],
    };
    const supabase = buildMockSupabase(state);

    const outcome = await processOneEquipmentImport(
      supabase as never,
      baseMessage()
    );

    expect(outcome).toEqual({ status: "skipped", reason: "Already exists" });
    expect(state.upsertCount).toBe(1);
    expect(state.itemInsertCount).toBe(1);
    expect(state.itemPayloads[0]).toMatchObject({
      status: "failed",
      message: "Already exists",
    });
  });

  it("returns error + records the item with the upsert error message", async () => {
    const state: MockSupabaseState = {
      upsertCount: 0,
      upsertReturn: {
        error: { message: "permission denied for table equipment" },
        count: null,
      },
      itemInsertCount: 0,
      itemInsertReturn: { error: null },
      itemPayloads: [],
    };
    const supabase = buildMockSupabase(state);

    const outcome = await processOneEquipmentImport(
      supabase as never,
      baseMessage()
    );

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toBe("permission denied for table equipment");
    }
    expect(state.itemInsertCount).toBe(1);
    expect(state.itemPayloads[0]).toMatchObject({
      status: "failed",
      message: "permission denied for table equipment",
    });
  });

  it("uses subcategoryOverride when set (admin chose a different type)", async () => {
    const state: MockSupabaseState = {
      upsertCount: 0,
      upsertReturn: { error: null, count: 1 },
      itemInsertCount: 0,
      itemInsertReturn: { error: null },
      itemPayloads: [],
    };
    // Spy on the actual upsert argument shape so we can assert subcategory passes through.
    let capturedUpsertRow: Record<string, unknown> | null = null;
    const supabase = {
      from(table: string) {
        if (table === "equipment") {
          return {
            upsert: vi
              .fn()
              .mockImplementation(async (row: Record<string, unknown>) => {
                state.upsertCount++;
                capturedUpsertRow = row;
                return state.upsertReturn;
              }),
          };
        }
        return {
          insert: vi
            .fn()
            .mockImplementation(async (payload: Record<string, unknown>) => {
              state.itemInsertCount++;
              state.itemPayloads.push(payload);
              return state.itemInsertReturn;
            }),
        };
      },
    };

    const outcome = await processOneEquipmentImport(
      supabase as never,
      baseMessage({ subcategoryOverride: "anti" })
    );

    expect(outcome).toEqual({ status: "inserted" });
    expect(capturedUpsertRow).toMatchObject({ subcategory: "anti" });
  });

  it("swallows duplicate-key (23505) errors on the item insert (queue retry)", async () => {
    const state: MockSupabaseState = {
      upsertCount: 0,
      upsertReturn: { error: null, count: 1 },
      itemInsertCount: 0,
      itemInsertReturn: { error: { message: "duplicate key", code: "23505" } },
      itemPayloads: [],
    };
    const supabase = buildMockSupabase(state);

    // The first attempt's item insert already counted; on a Cloudflare
    // retry the second attempt's insert hits the UNIQUE(job_id, slug)
    // constraint. The processor must NOT throw — it must return the
    // outcome the upsert dictated so the consumer can ack cleanly.
    const outcome = await processOneEquipmentImport(
      supabase as never,
      baseMessage()
    );

    expect(outcome).toEqual({ status: "inserted" });
  });
});

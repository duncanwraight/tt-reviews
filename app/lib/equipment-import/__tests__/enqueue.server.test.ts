import { describe, expect, it, vi } from "vitest";

import type { RevspinProduct } from "../../revspin.server";
import { enqueueEquipmentImport, SEND_BATCH_MAX } from "../enqueue.server";

// TT-243 + TT-244: producer-side rules locked in here.
//
//   * sendBatch in chunks of ≤100 (TT-243 / TT-238 50-subrequest cap).
//   * No early abort on chunk throw — partial run is still better than
//     nothing.
//   * Dedupe by generateSlug(name) before counting `total` or
//     enqueueing (TT-244 case 1 — silent counter-leak prod bug on
//     2026-05-17 from revspin's "Stiga DNA Dragon Power 52.5" /
//     "Xiom Jekyll & Hyde Z52.5" / "Nittaku Fastarc G-1" collisions).
//   * Reconcile `total` downward when `enqueued < unique count`
//     (TT-244 case 3 — chunk failures otherwise leave the job stuck).

function buildProduct(name: string): RevspinProduct {
  return {
    name,
    manufacturer: "Butterfly",
    category: "rubber",
    subcategory: "inverted",
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    sourceUrl: `https://revspin.net/rubber/${name}.html`,
    specifications: { weight: "42g" },
  };
}

interface SupabaseMockOpts {
  jobInsert?: { id: string } | null;
  jobInsertError?: string | null;
  jobUpdateError?: string | null;
}

interface SupabaseMockState {
  insertCalls: Array<Record<string, unknown>>;
  updateCalls: Array<{ patch: Record<string, unknown>; id: string }>;
}

function buildSupabase(opts: SupabaseMockOpts = {}) {
  const state: SupabaseMockState = { insertCalls: [], updateCalls: [] };
  const jobId = opts.jobInsert?.id ?? "job-1";
  const insertError = opts.jobInsertError ?? null;
  const updateError = opts.jobUpdateError ?? null;

  const supabase = {
    from(table: string) {
      if (table !== "equipment_import_jobs") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        insert(payload: Record<string, unknown>) {
          state.insertCalls.push(payload);
          return {
            select: () => ({
              single: async () =>
                insertError
                  ? { data: null, error: { message: insertError } }
                  : { data: { id: jobId }, error: null },
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_col: string, id: string) => {
              state.updateCalls.push({ patch, id });
              return updateError
                ? { error: { message: updateError } }
                : { error: null };
            },
          };
        },
      };
    },
  };
  return { supabase, state };
}

describe("enqueueEquipmentImport", () => {
  it("returns error and never enqueues when no products selected", async () => {
    const queue = { sendBatch: vi.fn() };
    const { supabase, state } = buildSupabase();
    const result = await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products: [],
      subcategoryOverride: null,
    });

    expect(result).toEqual({
      status: "error",
      message: "No products selected",
    });
    expect(state.insertCalls).toHaveLength(0);
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it("propagates the job-row insert error", async () => {
    const queue = { sendBatch: vi.fn() };
    const { supabase } = buildSupabase({
      jobInsertError: "permission denied for table equipment_import_jobs",
    });
    const result = await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products: [buildProduct("A")],
      subcategoryOverride: null,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBe(
        "permission denied for table equipment_import_jobs"
      );
    }
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it("ships 1000 products in 10 sendBatch calls (≤100 per call)", async () => {
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };
    const { supabase, state } = buildSupabase({ jobInsert: { id: "job-1" } });
    const products = Array.from({ length: 1000 }, (_, i) =>
      buildProduct(`Product ${i}`)
    );

    const result = await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: null,
    });

    expect(result).toMatchObject({
      status: "ok",
      jobId: "job-1",
      duplicatesDropped: 0,
      enqueued: 1000,
      chunkErrors: [],
    });
    expect(state.insertCalls[0]).toMatchObject({ total: 1000 });
    expect(state.updateCalls).toHaveLength(0);
    expect(queue.sendBatch).toHaveBeenCalledTimes(10);
    for (const call of queue.sendBatch.mock.calls) {
      const chunk = call[0] as Array<{ body: unknown }>;
      expect(chunk.length).toBeLessThanOrEqual(SEND_BATCH_MAX);
    }
    const firstChunk = queue.sendBatch.mock.calls[0][0] as Array<{
      body: { slug: string; job_id: string; attempts: number };
    }>;
    expect(firstChunk[0].body.job_id).toBe("job-1");
    expect(firstChunk[0].body.slug).toBe("product-0");
    expect(firstChunk[0].body.attempts).toBe(0);
    expect(firstChunk).toHaveLength(100);
  });

  it("ships a partial run when one chunk throws (no early abort) and reconciles total down", async () => {
    const queue = {
      sendBatch: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Payload Too Large"))
        .mockResolvedValueOnce(undefined),
    };
    const { supabase, state } = buildSupabase({ jobInsert: { id: "job-2" } });
    const products = Array.from({ length: 250 }, (_, i) =>
      buildProduct(`Product ${i}`)
    );

    const result = await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: null,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.enqueued).toBe(150);
      expect(result.chunkErrors).toHaveLength(1);
      expect(result.chunkErrors[0]).toContain("chunk 2/3");
      expect(result.chunkErrors[0]).toContain("Payload Too Large");
    }
    expect(queue.sendBatch).toHaveBeenCalledTimes(3);
    // TT-244 case 3: total reconciled down to actually-enqueued so the
    // trigger can fire finished_at once the 150 surviving messages drain.
    expect(state.updateCalls).toEqual([{ patch: { total: 150 }, id: "job-2" }]);
  });

  it("threads subcategoryOverride into every message", async () => {
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };
    const { supabase } = buildSupabase({ jobInsert: { id: "job-3" } });
    const products = [buildProduct("X"), buildProduct("Y")];

    await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: "anti",
    });

    const chunk = queue.sendBatch.mock.calls[0][0] as Array<{
      body: { subcategoryOverride: string | null };
    }>;
    for (const msg of chunk) {
      expect(msg.body.subcategoryOverride).toBe("anti");
    }
  });

  it("dedupes products by generateSlug(name) before counting total", async () => {
    // TT-244 case 1 repro: revspin gave us two entries that collapse to
    // the same slug. Producer must keep the first and drop the second,
    // and total must reflect the unique count — otherwise the consumer's
    // recordItem(23505) swallow leaks a counter and the job hangs.
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };
    const { supabase, state } = buildSupabase({ jobInsert: { id: "job-4" } });
    const products = [
      buildProduct("DNA Dragon Power 52.5"),
      buildProduct("DNA Dragon Power 52.5"), // identical name → same slug
      buildProduct("Tenergy 05"),
      buildProduct("TENERGY 05"), // generateSlug lowercases → same slug
      buildProduct("Hurricane 3"),
    ];

    const result = await enqueueEquipmentImport({
      supabase: supabase as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: null,
    });

    expect(result).toMatchObject({
      status: "ok",
      jobId: "job-4",
      duplicatesDropped: 2,
      enqueued: 3,
      chunkErrors: [],
    });
    expect(state.insertCalls[0]).toMatchObject({ total: 3 });
    // No reconcile needed — enqueued already matches the unique count.
    expect(state.updateCalls).toHaveLength(0);

    const chunk = queue.sendBatch.mock.calls[0][0] as Array<{
      body: { slug: string };
    }>;
    expect(chunk.map(m => m.body.slug)).toEqual([
      "dna-dragon-power-52-5",
      "tenergy-05",
      "hurricane-3",
    ]);
  });
});

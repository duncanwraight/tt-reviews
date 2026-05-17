import { describe, expect, it, vi } from "vitest";

import type { RevspinProduct } from "../../revspin.server";
import { enqueueEquipmentImport, SEND_BATCH_MAX } from "../enqueue.server";

// TT-243: producer-side chunking lock. The previous TT-238 producer
// did serial `queue.send` and 500'd after ~48 products because each
// send is one Cloudflare subrequest. The helper here MUST use
// sendBatch in chunks of ≤100 and MUST NOT abort remaining chunks if
// one throws — a partially-shipped run is still better than nothing.

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

function buildJobInsertMock(jobId: string, error: string | null = null) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue(
        error
          ? { data: null, error: { message: error } }
          : { data: { id: jobId }, error: null }
      ),
  };
}

function buildSupabase(jobInsertMock: ReturnType<typeof buildJobInsertMock>) {
  return {
    from: vi.fn((table: string) => {
      if (table === "equipment_import_jobs") return jobInsertMock;
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe("enqueueEquipmentImport", () => {
  it("returns error and never enqueues when no products selected", async () => {
    const queue = { sendBatch: vi.fn() };
    const jobInsert = buildJobInsertMock("unused");
    const result = await enqueueEquipmentImport({
      supabase: buildSupabase(jobInsert) as never,
      queue,
      userId: "u1",
      products: [],
      subcategoryOverride: null,
    });

    expect(result).toEqual({
      status: "error",
      message: "No products selected",
    });
    expect(jobInsert.insert).not.toHaveBeenCalled();
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it("propagates the job-row insert error", async () => {
    const queue = { sendBatch: vi.fn() };
    const jobInsert = buildJobInsertMock(
      "unused",
      "permission denied for table equipment_import_jobs"
    );
    const result = await enqueueEquipmentImport({
      supabase: buildSupabase(jobInsert) as never,
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
    const jobInsert = buildJobInsertMock("job-1");
    const products = Array.from({ length: 1000 }, (_, i) =>
      buildProduct(`Product ${i}`)
    );

    const result = await enqueueEquipmentImport({
      supabase: buildSupabase(jobInsert) as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: null,
    });

    expect(result).toMatchObject({
      status: "ok",
      jobId: "job-1",
      enqueued: 1000,
      chunkErrors: [],
    });
    expect(queue.sendBatch).toHaveBeenCalledTimes(10);
    for (const call of queue.sendBatch.mock.calls) {
      const chunk = call[0] as Array<{ body: unknown }>;
      expect(chunk.length).toBeLessThanOrEqual(SEND_BATCH_MAX);
    }
    // First batch carries the first 100 products in order.
    const firstChunk = queue.sendBatch.mock.calls[0][0] as Array<{
      body: { slug: string; job_id: string };
    }>;
    expect(firstChunk[0].body.job_id).toBe("job-1");
    expect(firstChunk[0].body.slug).toBe("product-0");
    expect(firstChunk).toHaveLength(100);
  });

  it("ships a partial run when one chunk throws (no early abort)", async () => {
    const queue = {
      sendBatch: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Payload Too Large"))
        .mockResolvedValueOnce(undefined),
    };
    const jobInsert = buildJobInsertMock("job-2");
    const products = Array.from({ length: 250 }, (_, i) =>
      buildProduct(`Product ${i}`)
    );

    const result = await enqueueEquipmentImport({
      supabase: buildSupabase(jobInsert) as never,
      queue,
      userId: "u1",
      products,
      subcategoryOverride: null,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      // Chunks 1 + 3 succeeded (100 + 50); chunk 2 (100) failed.
      expect(result.enqueued).toBe(150);
      expect(result.chunkErrors).toHaveLength(1);
      expect(result.chunkErrors[0]).toContain("chunk 2/3");
      expect(result.chunkErrors[0]).toContain("Payload Too Large");
    }
    expect(queue.sendBatch).toHaveBeenCalledTimes(3);
  });

  it("threads subcategoryOverride into every message", async () => {
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };
    const jobInsert = buildJobInsertMock("job-3");
    const products = [buildProduct("X"), buildProduct("Y")];

    await enqueueEquipmentImport({
      supabase: buildSupabase(jobInsert) as never,
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
});

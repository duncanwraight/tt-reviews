import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogContext } from "../../logger.server";
import { enqueueSpecSourceBatch } from "../scheduler.server";
import type { SpecSourceMessage } from "../types";

const ctx = createLogContext("scheduler-test");

function fakeSupabase(args: {
  rpcResult?: unknown;
  rpcError?: string;
}): SupabaseClient {
  return {
    rpc(name: string, params: unknown) {
      expect(name).toBe("pick_spec_source_batch");
      expect(params).toEqual({ p_limit: expect.any(Number) });
      if (args.rpcError) {
        return Promise.resolve({
          data: null,
          error: { message: args.rpcError },
        });
      }
      return Promise.resolve({ data: args.rpcResult ?? [], error: null });
    },
  } as unknown as SupabaseClient;
}

function fakeQueue(): {
  send: ReturnType<typeof vi.fn>;
  sent: SpecSourceMessage[];
} {
  const sent: SpecSourceMessage[] = [];
  const send = vi.fn(async (msg: SpecSourceMessage) => {
    sent.push(msg);
  });
  return { send, sent };
}

describe("enqueueSpecSourceBatch", () => {
  it("calls the RPC and enqueues one message per row returned", async () => {
    const supabase = fakeSupabase({
      rpcResult: [
        {
          equipment_id: "eq-1",
          slug: "stiga-allround-classic",
          brand: "Stiga",
          name: "Allround Classic",
          category: "blade",
          subcategory: null,
        },
        {
          equipment_id: "eq-2",
          slug: "butterfly-viscaria",
          brand: "Butterfly",
          name: "Viscaria",
          category: "blade",
          subcategory: null,
        },
      ],
    });
    const queue = fakeQueue();

    const result = await enqueueSpecSourceBatch(supabase, queue, ctx);

    expect(result).toEqual({ picked: 2, enqueued: 2 });
    expect(queue.sent).toHaveLength(2);
    expect(queue.sent[0]).toMatchObject({
      equipmentId: "eq-1",
      slug: "stiga-allround-classic",
      brand: "Stiga",
      name: "Allround Classic",
      attempts: 0,
    });
  });

  it("respects an injected batch size", async () => {
    const supabase = {
      rpc(_name: string, params: { p_limit: number }) {
        expect(params).toEqual({ p_limit: 5 });
        return Promise.resolve({ data: [], error: null });
      },
    } as unknown as SupabaseClient;
    const queue = fakeQueue();
    await enqueueSpecSourceBatch(supabase, queue, ctx, { batchSize: 5 });
  });

  it("returns picked=0/enqueued=0 when the RPC returns an empty array", async () => {
    const supabase = fakeSupabase({ rpcResult: [] });
    const queue = fakeQueue();
    const result = await enqueueSpecSourceBatch(supabase, queue, ctx);
    expect(result).toEqual({ picked: 0, enqueued: 0 });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("throws when the RPC errors so the cron's outer catch alerts via Discord", async () => {
    const supabase = fakeSupabase({ rpcError: "permission denied" });
    const queue = fakeQueue();
    await expect(enqueueSpecSourceBatch(supabase, queue, ctx)).rejects.toThrow(
      /pick_spec_source_batch failed/
    );
  });

  it("continues past a single send failure rather than aborting the batch", async () => {
    const supabase = fakeSupabase({
      rpcResult: [
        {
          equipment_id: "eq-1",
          slug: "a",
          brand: "A",
          name: "A1",
          category: "blade",
          subcategory: null,
        },
        {
          equipment_id: "eq-2",
          slug: "b",
          brand: "B",
          name: "B1",
          category: "blade",
          subcategory: null,
        },
      ],
    });
    let calls = 0;
    const queue = {
      send: vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error("queue offline");
      }),
    };

    const result = await enqueueSpecSourceBatch(supabase, queue, ctx);
    expect(result).toEqual({ picked: 2, enqueued: 1 });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requeueOneEquipmentPhotos,
  type PhotoSourceQueue,
} from "../requeue-one.server";
import type { PhotoSourceMessage } from "../queue.server";

interface FakeOps {
  deleteError?: string;
  updateError?: string;
}

interface FakeCalls {
  deleteEqFilter?: { col: string; val: string };
  deleteIsFilter?: { col: string; val: null };
  updatedFor?: string;
  updatePayload?: unknown;
}

function fakeSupabase(ops: FakeOps): {
  client: SupabaseClient;
  calls: FakeCalls;
} {
  const calls: FakeCalls = {};
  const client = {
    from(table: string) {
      if (table === "equipment_photo_candidates") {
        return {
          delete() {
            return {
              eq(col: string, val: string) {
                calls.deleteEqFilter = { col, val };
                return {
                  is(isCol: string, isVal: null) {
                    calls.deleteIsFilter = { col: isCol, val: isVal };
                    if (ops.deleteError) {
                      return Promise.resolve({
                        data: null,
                        error: { message: ops.deleteError },
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "equipment") {
        return {
          update(payload: unknown) {
            return {
              eq(_col: string, val: string) {
                calls.updatedFor = val;
                calls.updatePayload = payload;
                if (ops.updateError) {
                  return Promise.resolve({
                    data: null,
                    error: { message: ops.updateError },
                  });
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function fakeQueue(): PhotoSourceQueue & { sent: PhotoSourceMessage[] } {
  const sent: PhotoSourceMessage[] = [];
  return {
    sent,
    send: vi.fn(async (msg: PhotoSourceMessage) => {
      sent.push(msg);
    }),
  };
}

const row = { id: "eq-1", slug: "butterfly-viscaria" };

describe("requeueOneEquipmentPhotos", () => {
  it("deletes only un-picked candidates, clears cooldown, enqueues", async () => {
    const { client, calls } = fakeSupabase({});
    const queue = fakeQueue();

    await requeueOneEquipmentPhotos(client, queue, row);

    expect(calls.deleteEqFilter).toEqual({ col: "equipment_id", val: "eq-1" });
    // The .is('picked_at', null) filter is what protects the live image
    // — picked_at != null rows back equipment.image_key.
    expect(calls.deleteIsFilter).toEqual({ col: "picked_at", val: null });
    expect(calls.updatedFor).toBe("eq-1");
    expect(calls.updatePayload).toEqual({
      image_sourcing_attempted_at: null,
      image_skipped_at: null,
    });
    // image_key intentionally NOT in the payload — the live image
    // survives until a new candidate is picked. The consumer reads
    // image_key off the equipment row to decide whether to auto-pick,
    // so leaving it set is what routes the new candidates to review
    // instead of clobbering the live image (TT-173).
    expect(calls.updatePayload).not.toHaveProperty("image_key");
    expect(queue.sent).toEqual([{ slug: "butterfly-viscaria" }]);
  });

  it("propagates a candidate-delete failure without enqueueing", async () => {
    const { client } = fakeSupabase({ deleteError: "rls violation" });
    const queue = fakeQueue();

    await expect(requeueOneEquipmentPhotos(client, queue, row)).rejects.toThrow(
      /delete candidates: rls violation/
    );
    expect(queue.sent).toHaveLength(0);
  });

  it("propagates an equipment-update failure without enqueueing", async () => {
    const { client } = fakeSupabase({ updateError: "permission denied" });
    const queue = fakeQueue();

    await expect(requeueOneEquipmentPhotos(client, queue, row)).rejects.toThrow(
      /reset cooldown: permission denied/
    );
    expect(queue.sent).toHaveLength(0);
  });
});

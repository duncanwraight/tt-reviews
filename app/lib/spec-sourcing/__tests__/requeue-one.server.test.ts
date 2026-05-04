import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requeueOneEquipmentSpecs,
  type SpecSourceQueue,
} from "../requeue-one.server";
import type { SpecSourceMessage } from "../types";

interface FakeOps {
  deleteError?: string;
  updateError?: string;
}

interface FakeCalls {
  deletedFor?: string;
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
      if (table === "equipment_spec_proposals") {
        return {
          delete() {
            return {
              eq(_col: string, val: string) {
                calls.deletedFor = val;
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

function fakeQueue(): SpecSourceQueue & { sent: SpecSourceMessage[] } {
  const sent: SpecSourceMessage[] = [];
  return {
    sent,
    send: vi.fn(async (msg: SpecSourceMessage) => {
      sent.push(msg);
    }),
  };
}

const row = {
  id: "eq-1",
  slug: "butterfly-viscaria",
  manufacturer: "Butterfly",
  name: "Viscaria",
  category: "blade" as const,
  subcategory: null,
};

describe("requeueOneEquipmentSpecs", () => {
  it("deletes proposal, resets cooldown, then enqueues message", async () => {
    const { client, calls } = fakeSupabase({});
    const queue = fakeQueue();

    await requeueOneEquipmentSpecs(client, queue, row);

    expect(calls.deletedFor).toBe("eq-1");
    expect(calls.updatedFor).toBe("eq-1");
    expect(calls.updatePayload).toEqual({
      specs_sourced_at: null,
      specs_source_status: null,
    });
    expect(queue.sent).toEqual([
      {
        equipmentId: "eq-1",
        slug: "butterfly-viscaria",
        brand: "Butterfly",
        name: "Viscaria",
        category: "blade",
        subcategory: null,
        attempts: 0,
      },
    ]);
  });

  it("propagates a delete-proposal failure without enqueueing", async () => {
    const { client } = fakeSupabase({ deleteError: "rls violation" });
    const queue = fakeQueue();

    await expect(requeueOneEquipmentSpecs(client, queue, row)).rejects.toThrow(
      /delete proposal: rls violation/
    );
    expect(queue.sent).toHaveLength(0);
  });

  it("propagates an equipment-update failure without enqueueing", async () => {
    const { client } = fakeSupabase({ updateError: "permission denied" });
    const queue = fakeQueue();

    await expect(requeueOneEquipmentSpecs(client, queue, row)).rejects.toThrow(
      /reset cooldown: permission denied/
    );
    expect(queue.sent).toHaveLength(0);
  });
});

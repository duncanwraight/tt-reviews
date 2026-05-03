import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogContext } from "../../logger.server";
import { getSpecSourcingStatus } from "../status.server";

const ctx = createLogContext("status-test");

function fakeSupabase(args: {
  rpcResult?: unknown;
  rpcError?: string;
}): SupabaseClient {
  return {
    rpc(name: string) {
      expect(name).toBe("get_spec_sourcing_status");
      if (args.rpcError) {
        return Promise.resolve({
          data: null,
          error: { message: args.rpcError },
        });
      }
      return Promise.resolve({ data: args.rpcResult ?? null, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("getSpecSourcingStatus", () => {
  it("maps the RPC JSONB shape into camelCase fields", async () => {
    const supabase = fakeSupabase({
      rpcResult: {
        last_activity_at: "2026-05-03T08:00:00.000Z",
        pending_review: 7,
        never_sourced: 224,
        in_cooldown: 12,
        applied_total: 3,
      },
    });

    const result = await getSpecSourcingStatus(supabase, ctx);
    expect(result).toEqual({
      lastActivityAt: "2026-05-03T08:00:00.000Z",
      pendingReview: 7,
      neverSourced: 224,
      inCooldown: 12,
      appliedTotal: 3,
    });
  });

  it("returns the zero-status fallback when the RPC errors so the dashboard renders", async () => {
    const supabase = fakeSupabase({ rpcError: "rpc unavailable" });
    const result = await getSpecSourcingStatus(supabase, ctx);
    expect(result).toEqual({
      lastActivityAt: null,
      pendingReview: 0,
      neverSourced: 0,
      inCooldown: 0,
      appliedTotal: 0,
    });
  });

  it("returns the zero-status fallback when the RPC returns null data", async () => {
    const supabase = fakeSupabase({ rpcResult: null });
    const result = await getSpecSourcingStatus(supabase, ctx);
    expect(result.pendingReview).toBe(0);
    expect(result.neverSourced).toBe(0);
  });
});

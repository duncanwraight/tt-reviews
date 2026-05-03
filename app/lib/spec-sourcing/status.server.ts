// Admin dashboard status query for the spec-sourcing pipeline (TT-149).
// One PostgREST round-trip via the `get_spec_sourcing_status` RPC
// added in 20260503092459_add_spec_sourcing_rpcs.sql — keeps the
// dashboard well under the 50-subrequest cap.
//
// The signals are deliberately derivable from existing tables (no
// dedicated cron-runs table) — last_activity_at is MAX(equipment.
// specs_sourced_at), which is a strict lower bound on cron health.
// Empty cron ticks (everything in cooldown) don't bump it; an actual
// failure fires a Discord alert via Logger.error in the cron path.

import type { SupabaseClient } from "@supabase/supabase-js";

import { Logger, type LogContext } from "../logger.server";

export interface SpecSourcingStatus {
  lastActivityAt: string | null;
  pendingReview: number;
  neverSourced: number;
  inCooldown: number;
  appliedTotal: number;
}

const ZERO_STATUS: SpecSourcingStatus = {
  lastActivityAt: null,
  pendingReview: 0,
  neverSourced: 0,
  inCooldown: 0,
  appliedTotal: 0,
};

interface RpcShape {
  last_activity_at: string | null;
  pending_review: number;
  never_sourced: number;
  in_cooldown: number;
  applied_total: number;
}

export async function getSpecSourcingStatus(
  supabase: SupabaseClient,
  ctxLog: LogContext
): Promise<SpecSourcingStatus> {
  const { data, error } = await supabase.rpc("get_spec_sourcing_status");
  if (error) {
    Logger.error(
      "spec-sourcing.status.rpc-failed",
      ctxLog,
      new Error(error.message)
    );
    return ZERO_STATUS;
  }
  if (!data || typeof data !== "object") return ZERO_STATUS;
  const r = data as RpcShape;
  return {
    lastActivityAt: r.last_activity_at,
    pendingReview: r.pending_review ?? 0,
    neverSourced: r.never_sourced ?? 0,
    inCooldown: r.in_cooldown ?? 0,
    appliedTotal: r.applied_total ?? 0,
  };
}

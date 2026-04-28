// Photo-source queue consumer (TT-91). The Worker's queue() handler
// (workers/app.ts) calls processOneSourceMessage for each message in
// a batch. Pure function so unit tests can drive it without spinning
// up Miniflare's queue runtime.
//
// Retry semantics map provider statuses → re-queue decisions:
//   * sourced / already-imaged          → ack (terminal success).
//   * no-candidates with all 'ok'       → ack (genuinely no images;
//                                         attempted_at is stamped by
//                                         sourcePhotosForEquipment).
//   * no-candidates with non-ok status  → retry with exponential
//                                         backoff via msg.retry();
//                                         attempted_at stays null so
//                                         the next attempt runs the
//                                         providers again.
//   * thrown error                       → propagate; Cloudflare's
//                                         max_retries handles backoff
//                                         and eventually DLQs the
//                                         message.
//
// Auto-pick is the same rule the old bulk.server.ts used: exactly one
// trailing-match candidate at tier ≤ 2 → promote without admin review.
// The 'auto-picked' status lets the caller log + count distinctly.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourcePhotosForEquipment,
  type SourcingEnv,
  type SourcingResult,
} from "./source.server";
import { pickCandidate, type R2BucketSurface } from "./review.server";
import type { Provider } from "./providers/types";

export const AUTO_PICK_TIER_THRESHOLD = 2;

export interface PhotoSourceMessage {
  slug: string;
  // Re-queue counter — distinct from Cloudflare's max_retries which
  // resets on every successful ack. Used to compute exponential
  // backoff on out_of_budget.
  attempts?: number;
}

export type ProcessOutcome =
  | { status: "sourced"; insertedCount: number }
  | { status: "auto-picked"; r2Key: string }
  | { status: "already-imaged" }
  | { status: "no-candidates" }
  | { status: "transient"; reason: "rate_limited" | "out_of_budget" }
  | { status: "error"; message: string };

export interface ProcessDeps {
  sourceFn?: typeof sourcePhotosForEquipment;
  pickFn?: typeof pickCandidate;
}

// Process one queue message. Returns a ProcessOutcome the caller maps
// to ack vs retry; the inner sourcePhotosForEquipment + pickCandidate
// calls own all DB and R2 side effects.
export async function processOneSourceMessage(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  env: SourcingEnv,
  providers: Provider[],
  triggeredBy: string,
  message: PhotoSourceMessage,
  deps: ProcessDeps = {}
): Promise<ProcessOutcome> {
  const sourceFn = deps.sourceFn ?? sourcePhotosForEquipment;
  const pickFn = deps.pickFn ?? pickCandidate;

  let result: SourcingResult;
  try {
    result = await sourceFn(supabase, bucket, env, message.slug, {
      providers,
    });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.status === "already-imaged") {
    return { status: "already-imaged" };
  }

  if (result.status === "no-candidates") {
    // Distinguish transient (provider non-ok) from genuine empty.
    const transient = result.providerStatuses.find(
      p => p.status === "rate_limited" || p.status === "out_of_budget"
    );
    if (transient) {
      return {
        status: "transient",
        reason: transient.status as "rate_limited" | "out_of_budget",
      };
    }
    return { status: "no-candidates" };
  }

  // status === "sourced" — try auto-pick.
  const trailingTopTier = result.candidates.filter(
    c => c.match_kind === "trailing" && c.tier <= AUTO_PICK_TIER_THRESHOLD
  );
  if (trailingTopTier.length === 1) {
    try {
      await pickFn(supabase, bucket, {
        equipmentId: result.equipment.id,
        candidateId: trailingTopTier[0].id,
        pickedBy: triggeredBy,
      });
      return { status: "auto-picked", r2Key: trailingTopTier[0].r2_key };
    } catch {
      // Auto-pick failure is not fatal — the candidates are still in
      // the review queue, admin can pick manually. Treat as 'sourced'.
      return {
        status: "sourced",
        insertedCount: result.insertedCount,
      };
    }
  }

  return { status: "sourced", insertedCount: result.insertedCount };
}

// Backoff schedule for transient retries. Doubles up to a 1-hour cap.
// Out-of-budget is the typical case here — daily quota waits hours,
// monthly quota waits days, but we cap retries at the queue level
// (max_retries=5 in wrangler.toml) so a stuck-out-of-budget message
// eventually DLQs rather than spinning forever.
export function computeRetryDelaySeconds(attempts: number): number {
  const minutes = Math.min(60, 2 ** attempts);
  return minutes * 60;
}

// Photo-source queue consumer (TT-91). The Worker's queue() handler
// (workers/app.ts) calls processOneSourceMessage for each message in
// a batch. Pure function so unit tests can drive it without spinning
// up Miniflare's queue runtime.
//
// Retry semantics map provider statuses → re-queue decisions:
//   * sourced / auto-picked             → ack (terminal success).
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
// Auto-pick rule: row had no published image (image_key === null) AND
// providers returned exactly one trailing-match tier ≤ 2 hit → promote
// without admin review. Reading image_key off the equipment row (rather
// than from a message flag) means manual re-queue paths — which leave
// image_key in place to keep the live page populated — naturally fall
// through to review without any caller having to opt out.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourcePhotosForEquipment,
  type SourcingEnv,
  type SourcingResult,
} from "./source.server";
import { pickCandidate, type R2BucketSurface } from "./review.server";
import { recordPhotoEvent } from "./events.server";
import type { Provider } from "./providers/types";

export const AUTO_PICK_TIER_THRESHOLD = 2;

export interface PhotoSourceMessage {
  slug: string;
  // Re-queue counter — distinct from Cloudflare's max_retries which
  // resets on every successful ack. Used to compute exponential
  // backoff on out_of_budget.
  attempts?: number;
  // Source of this enqueue. Carried through to the sourcing_attempted
  // event so the activity feed can distinguish cron / admin-requeue /
  // queue-retry origins. Defaults to 'cron' when absent.
  triggeredBy?: string;
}

export type ProcessOutcome =
  | { status: "sourced"; insertedCount: number }
  | { status: "auto-picked"; r2Key: string }
  | { status: "no-candidates" }
  | { status: "transient"; reason: "rate_limited" | "out_of_budget" }
  | { status: "error"; message: string };

export interface ProcessDeps {
  sourceFn?: typeof sourcePhotosForEquipment;
  pickFn?: typeof pickCandidate;
  recordEvent?: typeof recordPhotoEvent;
}

// Process one queue message. Returns a ProcessOutcome the caller maps
// to ack vs retry; the inner sourcePhotosForEquipment + pickCandidate
// calls own all DB and R2 side effects.
export async function processOneSourceMessage(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  env: SourcingEnv,
  providers: Provider[],
  message: PhotoSourceMessage,
  deps: ProcessDeps = {}
): Promise<ProcessOutcome> {
  const sourceFn = deps.sourceFn ?? sourcePhotosForEquipment;
  const pickFn = deps.pickFn ?? pickCandidate;
  const recordEvent = deps.recordEvent ?? recordPhotoEvent;
  const triggeredBy = message.triggeredBy ?? "cron";

  let result: SourcingResult;
  try {
    result = await sourceFn(supabase, bucket, env, message.slug, {
      providers,
      triggeredBy,
    });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Emit one provider_transient event per non-ok provider, regardless
  // of whether the run produced candidates — a partial transient on a
  // multi-provider run still warrants visibility in the feed.
  const transientProviders = result.providerStatuses.filter(
    p => p.status === "rate_limited" || p.status === "out_of_budget"
  );
  for (const tp of transientProviders) {
    await recordEvent(supabase, {
      equipmentId: result.equipment.id,
      eventKind: "provider_transient",
      metadata: {
        provider: tp.name,
        reason: tp.status,
        attempts: message.attempts ?? 0,
      },
    });
  }

  if (result.status === "no-candidates") {
    if (transientProviders.length > 0) {
      const first = transientProviders[0];
      return {
        status: "transient",
        reason: first.status as "rate_limited" | "out_of_budget",
      };
    }
    return { status: "no-candidates" };
  }

  // status === "sourced" — try auto-pick.
  //
  // Auto-pick only fires when the row has no published image yet. A
  // re-queue of an already-picked row (admin correcting a wrong image)
  // leaves image_key in place to keep the live page populated, so we
  // route those candidates to review instead. Auto-promoting would
  // delete the previous picked row + R2 object via pickCandidate's
  // losers cleanup, leaving no fallback if the new pick is also wrong.
  if (result.equipment.image_key !== null) {
    if (result.insertedCount > 0) {
      await recordEvent(supabase, {
        equipmentId: result.equipment.id,
        eventKind: "routed_to_review",
        metadata: { candidate_count: result.insertedCount },
      });
    }
    return { status: "sourced", insertedCount: result.insertedCount };
  }

  const trailingTopTier = result.candidates.filter(
    c => c.match_kind === "trailing" && c.tier <= AUTO_PICK_TIER_THRESHOLD
  );
  if (trailingTopTier.length === 1) {
    try {
      // System-driven auto-pick: pickedBy is null. The picked_by FK on
      // equipment_photo_candidates is nullable (ON DELETE SET NULL) so
      // a system pick is fine without an actor. TT-175 tracks the
      // earlier shape where we passed the literal "queue-consumer"
      // string into a uuid column and silently caught the constraint
      // violation here.
      await pickFn(supabase, bucket, {
        equipmentId: result.equipment.id,
        candidateId: trailingTopTier[0].id,
        pickedBy: null,
      });
      await recordEvent(supabase, {
        equipmentId: result.equipment.id,
        eventKind: "auto_picked",
        metadata: {
          candidate_id: trailingTopTier[0].id,
          r2_key: trailingTopTier[0].r2_key,
          tier: trailingTopTier[0].tier,
        },
      });
      return { status: "auto-picked", r2Key: trailingTopTier[0].r2_key };
    } catch {
      // Auto-pick failure is not fatal — the candidates are still in
      // the review queue, admin can pick manually. Treat as 'sourced'
      // and emit routed_to_review so the feed reflects it.
      await recordEvent(supabase, {
        equipmentId: result.equipment.id,
        eventKind: "routed_to_review",
        metadata: { candidate_count: result.insertedCount },
      });
      return {
        status: "sourced",
        insertedCount: result.insertedCount,
      };
    }
  }

  if (result.insertedCount > 0) {
    await recordEvent(supabase, {
      equipmentId: result.equipment.id,
      eventKind: "routed_to_review",
      metadata: { candidate_count: result.insertedCount },
    });
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

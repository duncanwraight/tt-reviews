// Provider abstraction for photo sourcing (TT-89). Each provider takes
// an EquipmentSeed and returns ResolvedCandidates plus a status that
// the consumer (sourcePhotosForEquipment / queue consumer) uses to
// decide how to retry.
//
// status values:
//   'ok'             — provider returned candidates (possibly empty).
//   'rate_limited'   — provider hit a per-second / minute QPS cap;
//                      caller should skip this provider this turn but
//                      no need to delay the queue message.
//   'out_of_budget'  — provider hit a daily / monthly quota; caller
//                      should re-queue the message with a backoff so
//                      it retries after the quota window resets
//                      (TT-90 wiring lands the rate-limit + budget
//                      machinery; in TT-89 BraveProvider always
//                      returns 'ok' or throws).
//
// Errors thrown from resolveCandidates propagate to the caller.
// Recoverable per-provider failures should map to a status, not a
// throw.

import type { EquipmentSeed, ResolvedCandidate } from "../brave.server";
import type { SourcingEnv } from "../source.server";

export type ProviderStatus = "ok" | "rate_limited" | "out_of_budget";

export interface ProviderResult {
  status: ProviderStatus;
  candidates: ResolvedCandidate[];
}

export interface ProviderOptions {
  // Soft cap on the number of candidates the provider should return.
  // Implementations may return fewer; the caller re-applies an overall
  // cap after merging.
  limit?: number;
  // Test injection. Workers + node both have global fetch.
  fetchImpl?: typeof fetch;
}

export interface Provider {
  // Stable identifier used for logging + budget-counter keys. Use
  // lowercase short strings: 'brave', 'revspin', 'megaspin'.
  name: string;
  resolveCandidates(
    item: EquipmentSeed,
    env: SourcingEnv,
    options?: ProviderOptions
  ): Promise<ProviderResult>;
}

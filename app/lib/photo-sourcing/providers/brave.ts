// BraveProvider — wraps the existing resolveBraveCandidates resolver
// so it satisfies the Provider interface. In TT-89 it always returns
// status='ok' (or throws on hard error). TT-90 will layer the
// rate-limit / daily-budget checks on top, mapping their outcomes to
// 'rate_limited' / 'out_of_budget'.

import { resolveBraveCandidates } from "../brave.server";
import type { Provider, ProviderOptions, ProviderResult } from "./types";
import type { EquipmentSeed } from "../brave.server";
import type { SourcingEnv } from "../source.server";

export const braveProvider: Provider = {
  name: "brave",
  async resolveCandidates(
    item: EquipmentSeed,
    env: SourcingEnv,
    options: ProviderOptions = {}
  ): Promise<ProviderResult> {
    const candidates = await resolveBraveCandidates(
      item,
      env.BRAVE_SEARCH_API_KEY,
      { limit: options.limit, fetchImpl: options.fetchImpl }
    );
    return { status: "ok", candidates };
  },
};

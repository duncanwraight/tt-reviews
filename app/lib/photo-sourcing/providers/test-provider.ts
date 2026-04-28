// Deterministic test provider for e2e (TT-92). Activated by setting
// TEST_SOURCING_PROVIDER=true on the dev env (Playwright's webServer
// config sets it; CI does the same; prod never sees it).
//
// Returns slug-driven canned responses so a single e2e fixture can
// exercise multiple consumer paths:
//   *-empty       → status='ok', no candidates → no-candidates branch
//   *-rate        → status='rate_limited'      → transient retry
//   *-budget      → status='out_of_budget'     → transient retry
//   anything else → status='ok', no candidates (default safe path)
//
// We deliberately don't return candidates with real image URLs because
// the consumer would then try to fetch + R2-PUT bytes, which requires
// either a stub fetchImpl (more wiring) or a real reachable host. The
// queue → DB writeback chain is what we want to prove e2e; richer
// candidate-flow paths are covered by unit tests.

import type { Provider } from "./types";

export const testProvider: Provider = {
  name: "test",
  async resolveCandidates(item) {
    if (item.slug.endsWith("-rate")) {
      return { status: "rate_limited", candidates: [] };
    }
    if (item.slug.endsWith("-budget")) {
      return { status: "out_of_budget", candidates: [] };
    }
    return { status: "ok", candidates: [] };
  },
};

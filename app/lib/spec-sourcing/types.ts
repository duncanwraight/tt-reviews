// Shared types for the spec-sourcing pipeline (TT-149). Sit at the
// top of the module so both the scheduler (producer) and the queue
// consumer can import without circular deps.

export interface SpecSourceMessage {
  equipmentId: string;
  slug: string;
  brand: string;
  name: string;
  category: "blade" | "rubber" | string | null;
  subcategory: string | null;
  // Re-queue counter — distinct from Cloudflare's max_retries which
  // resets on every successful ack. Used to compute exponential
  // backoff on rate_limited / out_of_budget.
  attempts?: number;
}

// Outcome shape mirrors photo-sourcing's queue.server.ts so the
// worker queue() handler can branch identically.
export type ProcessOutcome =
  | { status: "proposed"; mergedFieldCount: number }
  | { status: "no-results" }
  | { status: "transient"; reason: "rate_limited" | "out_of_budget" }
  | { status: "error"; message: string };

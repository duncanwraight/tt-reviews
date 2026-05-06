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
  // backoff on rate_limited / out_of_budget / llm_unavailable.
  attempts?: number;
}

// Outcome shape mirrors photo-sourcing's queue.server.ts so the
// worker queue() handler can branch identically.
//
// llm_unavailable covers retryable upstream LLM errors — Gemini 503
// "high demand", network failures, 429 from the model endpoint. The
// budget wrapper reports those as status=ok with result=null and a
// failure_reason in diagnostics, so the queue consumer reclassifies
// them here to drive a backoff retry instead of a null_result that
// would otherwise burn the source for this run.
export type ProcessOutcome =
  | { status: "proposed"; mergedFieldCount: number }
  | { status: "no-results" }
  | {
      status: "transient";
      reason: "rate_limited" | "out_of_budget" | "llm_unavailable";
    }
  | { status: "error"; message: string };

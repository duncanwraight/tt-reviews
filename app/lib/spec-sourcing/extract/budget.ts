// Budget wrapper for the spec-sourcing LLM extractor (TT-148). Same
// daily/monthly KV cap shape as the photo-sourcing wrapper, just
// adapted to the SpecExtractor interface (which returns null on its
// own failures, so we wrap the whole call in a status-keyed envelope
// the queue consumer can branch on).
//
// Both `match` and `extract` count as one API call each — match
// prompts are tiny (~500 tokens) but each one still hits the Google
// AI Studio quota, and the free-tier RPD is 1000.

import {
  type BudgetKV,
  type BudgetRateLimit,
  DAILY_TTL_SECONDS,
  MONTHLY_TTL_SECONDS,
  dailyKey,
  increment,
  monthlyKey,
  readCount,
} from "../../providers/budget";
import type { EquipmentRef, SpecCandidate } from "../sources/types";
import type { ExtractedSpec, MatchResult, SpecExtractor } from "./types";

export type ExtractorStatus = "ok" | "rate_limited" | "out_of_budget";

export interface MatchEnvelope {
  status: ExtractorStatus;
  result?: MatchResult | null;
}

export interface ExtractEnvelope {
  status: ExtractorStatus;
  result?: ExtractedSpec | null;
}

export interface BudgetedSpecExtractor {
  id: string;
  match(
    html: string,
    equipment: EquipmentRef,
    candidate: SpecCandidate
  ): Promise<MatchEnvelope>;
  extract(html: string, equipment: EquipmentRef): Promise<ExtractEnvelope>;
}

export interface SpecExtractorBudgetOptions {
  rateLimiter?: BudgetRateLimit;
  kv?: BudgetKV;
  dailyCap?: number;
  monthlyCap?: number;
  // Test seam — defaults to wall-clock UTC.
  now?: () => Date;
}

async function preflightStatus(
  name: string,
  opts: SpecExtractorBudgetOptions
): Promise<Exclude<ExtractorStatus, "ok"> | null> {
  if (opts.rateLimiter) {
    const rl = await opts.rateLimiter.limit({ key: name });
    if (!rl.success) return "rate_limited";
  }
  if (!opts.kv) return null;
  const today = (opts.now ?? (() => new Date()))();
  if (opts.dailyCap !== undefined) {
    const used = await readCount(opts.kv, dailyKey(name, today));
    if (used >= opts.dailyCap) return "out_of_budget";
  }
  if (opts.monthlyCap !== undefined) {
    const used = await readCount(opts.kv, monthlyKey(name, today));
    if (used >= opts.monthlyCap) return "out_of_budget";
  }
  return null;
}

async function recordCall(
  name: string,
  opts: SpecExtractorBudgetOptions
): Promise<void> {
  if (!opts.kv) return;
  const today = (opts.now ?? (() => new Date()))();
  if (opts.dailyCap !== undefined) {
    await increment(opts.kv, dailyKey(name, today), DAILY_TTL_SECONDS);
  }
  if (opts.monthlyCap !== undefined) {
    await increment(opts.kv, monthlyKey(name, today), MONTHLY_TTL_SECONDS);
  }
}

export function withSpecExtractorBudget(
  inner: SpecExtractor,
  opts: SpecExtractorBudgetOptions = {}
): BudgetedSpecExtractor {
  return {
    id: inner.id,
    async match(html, equipment, candidate) {
      const block = await preflightStatus(inner.id, opts);
      if (block) return { status: block };
      const result = await inner.match(html, equipment, candidate);
      await recordCall(inner.id, opts);
      return { status: "ok", result };
    },
    async extract(html, equipment) {
      const block = await preflightStatus(inner.id, opts);
      if (block) return { status: block };
      const result = await inner.extract(html, equipment);
      await recordCall(inner.id, opts);
      return { status: "ok", result };
    },
  };
}

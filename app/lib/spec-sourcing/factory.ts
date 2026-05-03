// Spec-sourcing factory (TT-149). One place that knows how to wire
// the source registry + Gemini extractor from a Worker env. Mirrors
// app/lib/photo-sourcing/providers/factory.ts in shape — including
// the TEST swap that lets e2e + unit tests run without hitting the
// real Butterfly/TT11/RevSpin sites or the Gemini API.

import { Logger, createLogContext } from "../logger.server";
import { withSpecExtractorBudget } from "./extract/budget";
import { makeGeminiExtractor } from "./extract/gemini";
import type {
  BudgetedSpecExtractor,
  ExtractEnvelope,
  MatchEnvelope,
} from "./extract/budget";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./sources/types";
import { SPEC_SOURCES } from "./sources";
import type { BudgetKV } from "../providers/budget";

interface SpecSourcingEnv {
  GEMINI_API_KEY?: string;
  PROVIDER_QUOTA?: BudgetKV;
  GEMINI_DAILY_CAP?: string;
  GEMINI_MONTHLY_CAP?: string;
  // Test swap — when "true", returns deterministic stubs so e2e and
  // unit tests don't reach the real network. Set by Playwright's
  // webServer config alongside TEST_SOURCING_PROVIDER. Never set in
  // production.
  TEST_SPEC_SOURCING?: string;
}

// Free-tier Gemini RPD is 1000; leave headroom for manual ad-hoc runs.
export const DEFAULT_GEMINI_DAILY_CAP = 800;

function parseCapOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Test stub source — deterministically returns one candidate matching
// the equipment ref. The fetch returns a tiny HTML snippet keyed off
// the slug so the stub extractor can produce predictable specs.
const stubSource: SpecSource = {
  id: "test-stub",
  kind: "manufacturer",
  tier: 1,
  async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
    return [
      {
        url: `https://test-stub.local/${equipment.slug ?? equipment.name}.html`,
        title: `${equipment.brand} ${equipment.name}`.trim(),
      },
    ];
  },
  async fetch(candidateUrl: string) {
    return {
      html: `<html><body><h1>${candidateUrl}</h1></body></html>`,
      finalUrl: candidateUrl,
    };
  },
};

// Test stub extractor — returns a fixed ExtractedSpec shape so e2e
// tests can predict the proposal row's contents.
const stubExtractor: BudgetedSpecExtractor = {
  id: "test-stub-extractor",
  async match(): Promise<MatchEnvelope> {
    return {
      status: "ok",
      result: { matches: true, confidence: 0.95 },
    };
  },
  async extract(_html, equipment): Promise<ExtractEnvelope> {
    return {
      status: "ok",
      result: {
        specs: { weight: 89, plies_wood: 5, plies_composite: 2 },
        description: `Stub spec extraction for ${equipment.brand} ${equipment.name}.`,
        perFieldConfidence: {},
        rawHtmlExcerpt: "<stub>",
      },
    };
  },
};

export interface SpecSourcingFactoryOutput {
  sources: SpecSource[];
  extractor: BudgetedSpecExtractor;
}

export function buildSpecSourcingFromEnv(
  env: SpecSourcingEnv
): SpecSourcingFactoryOutput {
  if (env.TEST_SPEC_SOURCING === "true") {
    Logger.info(
      "spec-sourcing: TEST_SPEC_SOURCING active — using stub source + extractor",
      createLogContext("spec-sourcing-factory")
    );
    return { sources: [stubSource], extractor: stubExtractor };
  }

  if (!env.GEMINI_API_KEY) {
    Logger.warn(
      "spec-sourcing: GEMINI_API_KEY missing — extractor will be disabled. cron is a no-op until the key is set.",
      createLogContext("spec-sourcing-factory"),
      undefined
    );
  }

  const dailyCap = parseCapOrDefault(
    env.GEMINI_DAILY_CAP,
    DEFAULT_GEMINI_DAILY_CAP
  );
  const monthlyCap = env.GEMINI_MONTHLY_CAP
    ? parseCapOrDefault(env.GEMINI_MONTHLY_CAP, 0)
    : undefined;

  const extractor = withSpecExtractorBudget(
    makeGeminiExtractor({ apiKey: env.GEMINI_API_KEY ?? "" }),
    {
      kv: env.PROVIDER_QUOTA,
      dailyCap,
      monthlyCap,
    }
  );

  return { sources: SPEC_SOURCES, extractor };
}

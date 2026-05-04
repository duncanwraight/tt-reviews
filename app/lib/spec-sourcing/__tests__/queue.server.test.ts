import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogContext, Logger } from "../../logger.server";
import type {
  BudgetedSpecExtractor,
  ExtractEnvelope,
  MatchEnvelope,
} from "../extract/budget";
import type { ExtractedSpec } from "../extract/types";
import {
  orderSourcesForEquipment,
  processOneSpecMessage,
  computeRetryDelaySeconds,
} from "../queue.server";
import type { RunLogEntry } from "../run-log";
import type { SpecCandidate, SpecSource } from "../sources/types";
import type { SpecSourceMessage } from "../types";

const FROZEN_NOW = new Date(Date.UTC(2026, 4, 3, 12, 0, 0));
const NOW_ISO = FROZEN_NOW.toISOString();
const ctx = createLogContext("test");

const VISCARIA_MSG: SpecSourceMessage = {
  equipmentId: "11111111-1111-1111-1111-111111111111",
  slug: "butterfly-viscaria",
  brand: "Butterfly",
  name: "Viscaria",
  category: "blade",
  subcategory: null,
};

interface CapturedUpsert {
  table: string;
  values: Record<string, unknown>;
  onConflict?: string;
}

interface CapturedUpdate {
  table: string;
  values: Record<string, unknown>;
  filter: { column: string; value: unknown };
}

function fakeSupabase(opts?: { upsertError?: string; updateError?: string }): {
  client: SupabaseClient;
  upserts: CapturedUpsert[];
  updates: CapturedUpdate[];
} {
  const upserts: CapturedUpsert[] = [];
  const updates: CapturedUpdate[] = [];

  const client = {
    from(table: string) {
      return {
        upsert(
          values: Record<string, unknown>,
          options?: { onConflict?: string }
        ) {
          upserts.push({ table, values, onConflict: options?.onConflict });
          return Promise.resolve(
            opts?.upsertError
              ? { error: { message: opts.upsertError } }
              : { error: null }
          );
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              updates.push({ table, values, filter: { column, value } });
              return Promise.resolve(
                opts?.updateError
                  ? { error: { message: opts.updateError } }
                  : { error: null }
              );
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, upserts, updates };
}

function stubSource(args: {
  id: string;
  tier: 1 | 2 | 3;
  brand?: string;
  candidates: SpecCandidate[];
  fetchHtml?: string;
  fetchThrows?: boolean;
  searchThrows?: boolean;
}): SpecSource {
  return {
    id: args.id,
    kind:
      args.tier === 1
        ? "manufacturer"
        : args.tier === 2
          ? "retailer"
          : "review",
    tier: args.tier,
    brand: args.brand,
    async search() {
      if (args.searchThrows) throw new Error(`${args.id} search failed`);
      return args.candidates;
    },
    async fetch(url: string) {
      if (args.fetchThrows) throw new Error(`${args.id} fetch failed`);
      return { html: args.fetchHtml ?? `<html>${url}</html>`, finalUrl: url };
    },
  };
}

function okExtractor(extracted: ExtractedSpec | null): BudgetedSpecExtractor {
  return {
    id: "stub",
    async match(): Promise<MatchEnvelope> {
      return { status: "ok", result: { matches: true, confidence: 0.9 } };
    },
    async extract(): Promise<ExtractEnvelope> {
      return { status: "ok", result: extracted };
    },
  };
}

describe("orderSourcesForEquipment", () => {
  it("filters out brand-restricted sources whose brand doesn't match", () => {
    const a = stubSource({
      id: "stiga",
      tier: 1,
      brand: "Stiga",
      candidates: [],
    });
    const b = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [],
    });
    const c = stubSource({ id: "tt11", tier: 2, candidates: [] });
    const ordered = orderSourcesForEquipment([a, b, c], "Butterfly");
    expect(ordered.map(s => s.id)).toEqual(["butterfly", "tt11"]);
  });

  it("orders by tier ascending and prefers brand-bound sources within a tier", () => {
    const generic = stubSource({ id: "generic", tier: 1, candidates: [] });
    const branded = stubSource({
      id: "branded",
      tier: 1,
      brand: "Butterfly",
      candidates: [],
    });
    const tier3 = stubSource({ id: "rev", tier: 3, candidates: [] });
    const ordered = orderSourcesForEquipment(
      [generic, tier3, branded],
      "Butterfly"
    );
    expect(ordered.map(s => s.id)).toEqual(["branded", "generic", "rev"]);
  });
});

describe("processOneSpecMessage", () => {
  it("upserts a pending_review proposal when ≥1 source returns specs", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor = okExtractor({
      specs: { weight: 89, plies_wood: 5, plies_composite: 2 },
      description: "Viscaria description.",
      perFieldConfidence: {},
      rawHtmlExcerpt: "<excerpt>",
    });
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "proposed", mergedFieldCount: 4 });
    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0].table).toBe("equipment_spec_proposals");
    expect(sb.upserts[0].onConflict).toBe("equipment_id");
    expect(sb.upserts[0].values).toMatchObject({
      equipment_id: VISCARIA_MSG.equipmentId,
      status: "pending_review",
    });
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0]).toMatchObject({
      table: "equipment",
      values: {
        specs_sourced_at: NOW_ISO,
        specs_source_status: "pending_review",
      },
      filter: { column: "id", value: VISCARIA_MSG.equipmentId },
    });
  });

  it("upserts a no_results proposal when every source comes up empty", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [],
    });
    const extractor = okExtractor(null);
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "no-results" });
    expect(sb.upserts[0].values).toMatchObject({ status: "no_results" });
    expect(sb.updates[0].values).toMatchObject({
      specs_source_status: "no_results",
    });
  });

  it("returns transient when the extractor's match() reports rate_limited", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
        {
          url: "https://shop.butterfly.com/viscaria",
          title: "Viscaria",
        },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "rate_limited" };
      },
      async extract(): Promise<ExtractEnvelope> {
        return { status: "ok", result: null };
      },
    };
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "transient", reason: "rate_limited" });
    // No proposal upsert when the LLM call is short-circuited.
    expect(sb.upserts).toHaveLength(0);
    expect(sb.updates).toHaveLength(0);
  });

  it("returns transient when the extractor's extract() reports out_of_budget", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        return { status: "out_of_budget" };
      },
    };
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "transient", reason: "out_of_budget" });
    expect(sb.upserts).toHaveLength(0);
  });

  it("returns 'error' when the proposal upsert fails", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor = okExtractor({
      specs: { weight: 89 },
      description: null,
      perFieldConfidence: {},
      rawHtmlExcerpt: "",
    });
    const sb = fakeSupabase({ upsertError: "rls denied" });

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toContain("rls denied");
    }
  });

  it("walks tier 1 → tier 2 and merges contributions across them", async () => {
    const tier1 = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const tier2 = stubSource({
      id: "tt11",
      tier: 2,
      candidates: [
        {
          url: "https://tabletennis11.com/butterfly-viscaria",
          title: "Butterfly Viscaria",
        },
      ],
    });
    const sb = fakeSupabase();
    let callIdx = 0;
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        callIdx++;
        if (callIdx === 1) {
          return {
            status: "ok",
            result: {
              specs: { plies_wood: 5, plies_composite: 2 },
              description: "Manufacturer blurb.",
              perFieldConfidence: {},
              rawHtmlExcerpt: "",
            },
          };
        }
        return {
          status: "ok",
          result: {
            specs: { weight: 89 },
            description: "Retailer blurb.",
            perFieldConfidence: {},
            rawHtmlExcerpt: "",
          },
        };
      },
    };

    const outcome = await processOneSpecMessage(
      sb.client,
      [tier1, tier2],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "proposed", mergedFieldCount: 4 });
    const upsertValues = sb.upserts[0].values as {
      merged: { specs: Record<string, number>; description: string };
    };
    expect(upsertValues.merged.specs).toEqual({
      plies_wood: 5,
      plies_composite: 2,
      weight: 89,
    });
    expect(upsertValues.merged.description).toBe("Manufacturer blurb.");
  });

  it("treats a search() throw as a soft skip (continue to next source)", async () => {
    const broken = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [],
      searchThrows: true,
    });
    const tier2 = stubSource({
      id: "tt11",
      tier: 2,
      candidates: [
        {
          url: "https://tabletennis11.com/butterfly-viscaria",
          title: "Butterfly Viscaria",
        },
      ],
    });
    // Note: a previous tier2 candidate above already uses the same URL
    // for a different test. The fixture is shared shape, not state.
    const extractor = okExtractor({
      specs: { weight: 89 },
      description: null,
      perFieldConfidence: {},
      rawHtmlExcerpt: "",
    });
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [broken, tier2],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome.status).toBe("proposed");
  });
});

describe("processOneSpecMessage run_log (TT-162)", () => {
  function runLogFromUpsert(values: Record<string, unknown>): RunLogEntry[] {
    return (values.run_log as RunLogEntry[]) ?? [];
  }

  it("records source_skipped_brand for brand-bound sources that don't match", async () => {
    const stiga = stubSource({
      id: "stiga",
      tier: 1,
      brand: "Stiga",
      candidates: [],
    });
    const butterfly = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const sb = fakeSupabase();
    const extractor = okExtractor({
      specs: { weight: 89 },
      description: null,
      perFieldConfidence: {},
      rawHtmlExcerpt: "",
    });

    await processOneSpecMessage(
      sb.client,
      [stiga, butterfly],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const skip = log.find(e => e.step === "source_skipped_brand");
    expect(skip).toMatchObject({
      step: "source_skipped_brand",
      source_id: "stiga",
      source_brand: "Stiga",
      equipment_brand: "Butterfly",
    });
  });

  it("records search query_url when the source exposes searchUrl()", async () => {
    const source: SpecSource = {
      id: "butterfly",
      kind: "manufacturer",
      tier: 1,
      brand: "Butterfly",
      searchUrl: () =>
        "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria",
      async search() {
        return [
          { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
        ];
      },
      async fetch(url: string) {
        return { html: "<html></html>", finalUrl: url };
      },
    };
    const sb = fakeSupabase();
    const extractor = okExtractor({
      specs: { weight: 89 },
      description: null,
      perFieldConfidence: {},
      rawHtmlExcerpt: "",
    });

    await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const search = log.find(e => e.step === "search");
    expect(search).toMatchObject({
      step: "search",
      query_url: "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria",
      status: "ok",
      count: 1,
    });
  });

  it("records prefilter seed/brand tokens and per-candidate dropped reasons", async () => {
    const source = stubSource({
      id: "tt11",
      tier: 2,
      candidates: [
        {
          url: "https://www.tabletennis11.com/butterfly-viscaria",
          title: "Butterfly Viscaria",
        },
        {
          url: "https://www.tabletennis11.com/butterfly-viscaria-super-alc",
          title: "Butterfly Viscaria Super ALC",
        },
        {
          url: "https://www.tabletennis11.com/butterfly-innerforce-zlc",
          title: "Butterfly Innerforce ZLC",
        },
      ],
    });
    const sb = fakeSupabase();
    const extractor = okExtractor({
      specs: { weight: 89 },
      description: null,
      perFieldConfidence: {},
      rawHtmlExcerpt: "",
    });

    await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const prefilter = log.find(e => e.step === "prefilter");
    if (!prefilter || prefilter.step !== "prefilter") {
      throw new Error("expected a prefilter entry");
    }
    expect(prefilter.seed_tokens).toEqual(["viscaria"]);
    expect(prefilter.brand_tokens).toEqual(["butterfly"]);
    expect(prefilter.kept).toEqual([
      {
        url: "https://www.tabletennis11.com/butterfly-viscaria",
        title: "Butterfly Viscaria",
      },
    ]);
    const dropped = prefilter.dropped;
    const superAlc = dropped.find(d => d.url.includes("super-alc"));
    expect(superAlc?.extra_tokens.sort()).toEqual(["alc", "super"]);
    const innerforce = dropped.find(d => d.url.includes("innerforce"));
    expect(innerforce?.missing_tokens).toEqual(["viscaria"]);
  });

  it("records extract excerpt on a null result so the moderator can see the raw page", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
      fetchHtml: "<html><body>Page body that the LLM saw.</body></html>",
    });
    const extractor = okExtractor(null);
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "no-results" });
    const log = runLogFromUpsert(sb.upserts[0].values);
    const extract = log.find(e => e.step === "extract");
    expect(extract).toMatchObject({
      step: "extract",
      source_id: "butterfly",
      status: "null_result",
      excerpt: "<html><body>Page body that the LLM saw.</body></html>",
    });
    const sourceDone = log.find(e => e.step === "source_done");
    expect(sourceDone).toMatchObject({
      step: "source_done",
      source_id: "butterfly",
      reason: "extract_null",
    });
  });

  it("records terminal outcome=proposed with merge winners when fields are merged", async () => {
    const tier1 = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const tier2 = stubSource({
      id: "tt11",
      tier: 2,
      candidates: [
        {
          url: "https://tabletennis11.com/butterfly-viscaria",
          title: "Butterfly Viscaria",
        },
      ],
    });
    let callIdx = 0;
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        callIdx++;
        if (callIdx === 1) {
          return {
            status: "ok",
            result: {
              specs: { plies_wood: 5 },
              description: "Manufacturer blurb.",
              perFieldConfidence: {},
              rawHtmlExcerpt: "",
            },
          };
        }
        return {
          status: "ok",
          result: {
            specs: { weight: 89 },
            description: null,
            perFieldConfidence: {},
            rawHtmlExcerpt: "",
          },
        };
      },
    };
    const sb = fakeSupabase();

    await processOneSpecMessage(
      sb.client,
      [tier1, tier2],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const merge = log.find(e => e.step === "merge");
    expect(merge).toMatchObject({
      step: "merge",
      merged_field_count: 3,
      per_field_winners: { plies_wood: "butterfly", weight: "tt11" },
      description_source_id: "butterfly",
    });
    const outcome = log[log.length - 1];
    expect(outcome).toMatchObject({
      step: "outcome",
      status: "proposed",
      merged_field_count: 3,
    });
  });

  it("records the transient halt without persisting the proposal", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      // Two URLs that both pass the prefilter (same tokens after
      // tokenisation) so pickCandidateViaMatch reaches the LLM call.
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
        { url: "https://shop.butterfly.com/viscaria", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "rate_limited" };
      },
      async extract(): Promise<ExtractEnvelope> {
        return { status: "ok", result: null };
      },
    };
    const sb = fakeSupabase();

    const outcome = await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    expect(outcome).toEqual({ status: "transient", reason: "rate_limited" });
    expect(sb.upserts).toHaveLength(0);
  });

  it("records search.failed when source.search() throws", async () => {
    const broken = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [],
      searchThrows: true,
    });
    const tier2 = stubSource({
      id: "tt11",
      tier: 2,
      candidates: [],
    });
    const sb = fakeSupabase();
    const extractor = okExtractor(null);

    await processOneSpecMessage(
      sb.client,
      [broken, tier2],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const search = log.find(
      e => e.step === "search" && e.source_id === "butterfly"
    );
    expect(search).toMatchObject({
      step: "search",
      source_id: "butterfly",
      status: "failed",
      error: "butterfly search failed",
    });
  });
});

describe("processOneSpecMessage LLM diagnostics (TT-162)", () => {
  function runLogFromUpsert(values: Record<string, unknown>): RunLogEntry[] {
    return (values.run_log as RunLogEntry[]) ?? [];
  }

  it("persists LLM extract diagnostics on null_result entries", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        return {
          status: "ok",
          result: null,
          diagnostics: {
            failureReason: "schema_invalid",
            httpStatus: 200,
            tokens: 1234,
            rawResponse: '{"description":"only description, no specs"}',
            validationDetail: "missing or non-object `specs` field",
          },
        };
      },
    };
    const sb = fakeSupabase();

    await processOneSpecMessage(
      sb.client,
      [source],
      extractor,
      VISCARIA_MSG,
      ctx,
      { now: () => FROZEN_NOW }
    );

    const log = runLogFromUpsert(sb.upserts[0].values);
    const extract = log.find(e => e.step === "extract");
    expect(extract).toMatchObject({
      step: "extract",
      status: "null_result",
      failure_reason: "schema_invalid",
      validation_detail: "missing or non-object `specs` field",
      raw_response: '{"description":"only description, no specs"}',
      tokens: 1234,
      http_status: 200,
    });
  });

  it("Logger.error-alerts when extract diagnostics report auth_failed", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        return {
          status: "ok",
          result: null,
          diagnostics: {
            failureReason: "auth_failed",
            httpStatus: 401,
            rawResponse: "API key invalid",
            validationDetail: "Gemini returned HTTP 401",
          },
        };
      },
    };
    const sb = fakeSupabase();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});

    try {
      await processOneSpecMessage(
        sb.client,
        [source],
        extractor,
        VISCARIA_MSG,
        ctx,
        { now: () => FROZEN_NOW }
      );

      const fatal = errorSpy.mock.calls.find(
        c => typeof c[0] === "string" && c[0].includes("auth_failed.extract")
      );
      expect(fatal, "expected a fatal LLM Logger.error to fire").toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("Logger.error-alerts when match diagnostics report missing_api_key", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      // Two candidates so pickCandidateViaMatch reaches the match() call.
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
        { url: "https://shop.butterfly.com/viscaria", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return {
          status: "ok",
          result: null,
          diagnostics: {
            failureReason: "missing_api_key",
            validationDetail: "GEMINI_API_KEY not set",
          },
        };
      },
      async extract(): Promise<ExtractEnvelope> {
        return { status: "ok", result: null };
      },
    };
    const sb = fakeSupabase();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});

    try {
      await processOneSpecMessage(
        sb.client,
        [source],
        extractor,
        VISCARIA_MSG,
        ctx,
        { now: () => FROZEN_NOW }
      );

      const fatal = errorSpy.mock.calls.find(
        c => typeof c[0] === "string" && c[0].includes("missing_api_key.match")
      );
      expect(fatal, "expected a fatal LLM Logger.error to fire").toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does NOT alert on per-page failures like schema_invalid (noisy, not actionable)", async () => {
    const source = stubSource({
      id: "butterfly",
      tier: 1,
      brand: "Butterfly",
      candidates: [
        { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
      ],
    });
    const extractor: BudgetedSpecExtractor = {
      id: "stub",
      async match(): Promise<MatchEnvelope> {
        return { status: "ok", result: { matches: true, confidence: 1 } };
      },
      async extract(): Promise<ExtractEnvelope> {
        return {
          status: "ok",
          result: null,
          diagnostics: {
            failureReason: "schema_invalid",
            httpStatus: 200,
            validationDetail: "missing `specs`",
          },
        };
      },
    };
    const sb = fakeSupabase();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});

    try {
      await processOneSpecMessage(
        sb.client,
        [source],
        extractor,
        VISCARIA_MSG,
        ctx,
        { now: () => FROZEN_NOW }
      );

      const fatal = errorSpy.mock.calls.find(
        c => typeof c[0] === "string" && c[0].includes("spec-sourcing.llm.")
      );
      expect(
        fatal,
        "schema_invalid should NOT trigger a Discord alert"
      ).toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("computeRetryDelaySeconds", () => {
  it("doubles the minute count up to a 60-minute cap", () => {
    expect(computeRetryDelaySeconds(0)).toBe(60);
    expect(computeRetryDelaySeconds(1)).toBe(120);
    expect(computeRetryDelaySeconds(2)).toBe(240);
    expect(computeRetryDelaySeconds(3)).toBe(480);
    expect(computeRetryDelaySeconds(10)).toBe(3600);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogContext } from "../../logger.server";
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

describe("computeRetryDelaySeconds", () => {
  it("doubles the minute count up to a 60-minute cap", () => {
    expect(computeRetryDelaySeconds(0)).toBe(60);
    expect(computeRetryDelaySeconds(1)).toBe(120);
    expect(computeRetryDelaySeconds(2)).toBe(240);
    expect(computeRetryDelaySeconds(3)).toBe(480);
    expect(computeRetryDelaySeconds(10)).toBe(3600);
  });
});

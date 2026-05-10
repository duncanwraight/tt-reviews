// TT-157: integration tests for the Discord search RPCs.
//
// Hits the live Supabase REST API at SUPABASE_URL (default
// http://localhost:54321) using the anon key — no mocks. The pgTAP suite
// at supabase/tests/discord_search_rpcs.sql owns the deeper SQL-level
// assertions (multi-token, diacritics, EXPLAIN-asserted index use). This
// file exists to confirm the round-trip end-to-end through PostgREST so
// shape mismatches between the SQL function and the JS client surface
// here too.
//
// Skip behaviour: if Supabase isn't reachable within ~30s, the suite
// skips. This is the only acceptable local skip per CLAUDE.md memory
// (DB not running). In CI the wait is generous enough to absorb the
// slow `supabase start` race; if it still fails, the e2e job will fail
// against the same outage and surface the real problem there.

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function isReachable(): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      // Any non-network response means PostgREST is up.
      if (res.status < 500) return true;
    } catch {
      // network error — keep waiting
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

const reachable = await isReachable();

describe.skipIf(!reachable)(
  "Discord search RPCs (integration, hits local Supabase)",
  () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    interface EquipmentRow {
      id: string;
      name: string;
      manufacturer: string;
      slug: string;
      category: string;
      rank: number;
    }

    interface PlayerRow {
      id: string;
      name: string;
      slug: string;
      represents: string;
      rank: number;
    }

    async function eqSearch(query: string): Promise<EquipmentRow[]> {
      const { data, error } = await supabase.rpc("search_equipment", {
        query,
      });
      if (error)
        throw new Error(`search_equipment(${query}): ${error.message}`);
      return (data ?? []) as EquipmentRow[];
    }

    async function plSearch(query: string): Promise<PlayerRow[]> {
      const { data, error } = await supabase.rpc("search_players", { query });
      if (error) throw new Error(`search_players(${query}): ${error.message}`);
      return (data ?? []) as PlayerRow[];
    }

    it("search_equipment returns the expected row shape via PostgREST", async () => {
      const rows = await eqSearch("viscaria");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toMatchObject({
        slug: "butterfly-viscaria",
        name: expect.any(String),
        manufacturer: expect.any(String),
        category: expect.any(String),
        rank: expect.any(Number),
      });
      expect(rows[0].rank).toBeGreaterThan(0);
    });

    it("search_equipment matches manufacturer tokens (Victas VKM)", async () => {
      const rows = await eqSearch("Victas VKM");
      const slugs = rows.map(r => r.slug);
      expect(slugs).toContain("victas-vkm");
    });

    it("search_equipment returns >5 rows for 'butterfly' (ambiguity trigger)", async () => {
      const rows = await eqSearch("butterfly");
      expect(rows.length).toBeGreaterThan(5);
    });

    it("search_equipment returns 0 rows for clearly-absent text", async () => {
      const rows = await eqSearch("nonsense xyz123");
      expect(rows).toHaveLength(0);
    });

    it("search_players returns the expected row shape via PostgREST", async () => {
      // 'ma long' (full surname), not 'ma lo' — partial-token / prefix
      // matching isn't supported by the FTS configuration; that's fuzzy
      // matching, explicitly out of scope per parent TT-156.
      const rows = await plSearch("ma long");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toMatchObject({
        slug: "ma-long",
        name: expect.any(String),
        represents: expect.any(String),
        rank: expect.any(Number),
      });
    });

    it("search_players surfaces multiple matches when the query is non-specific", async () => {
      const rows = await plSearch("harimoto");
      expect(rows.length).toBeGreaterThan(1);
    });

    it("rows are ordered by rank descending", async () => {
      const rows = await eqSearch("butterfly");
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].rank).toBeLessThanOrEqual(rows[i - 1].rank);
      }
    });

    // Captures the rank distribution C3 will use to settle the 1.5×
    // ambiguity threshold (TT-156 Q5). Logged to stderr during test
    // runs so the data is searchable in CI logs without polluting
    // assertions.
    it("logs top vs runner-up rank ratios for threshold tuning", async () => {
      const equipmentSamples = ["viscaria", "butterfly", "tenergy"];
      const playerSamples = ["ma long", "harimoto", "lin", "wang"];
      const samples: { kind: "equipment" | "player"; query: string }[] = [
        ...equipmentSamples.map(q => ({
          kind: "equipment" as const,
          query: q,
        })),
        ...playerSamples.map(q => ({ kind: "player" as const, query: q })),
      ];
      for (const { kind, query: q } of samples) {
        const rows = kind === "player" ? await plSearch(q) : await eqSearch(q);
        if (rows.length >= 2) {
          const ratio = rows[0].rank / Math.max(rows[1].rank, 1e-6);
          console.error(
            `[TT-157 rank-ratio] q=${JSON.stringify(q)} top=${rows[0].rank.toFixed(4)} runner-up=${rows[1].rank.toFixed(4)} ratio=${ratio.toFixed(2)} count=${rows.length}`
          );
        } else {
          console.error(
            `[TT-157 rank-ratio] q=${JSON.stringify(q)} count=${rows.length}`
          );
        }
      }
      expect(true).toBe(true);
    });

    afterAll(() => {
      // No teardown needed — RPCs are read-only and the seed survives.
    });

    // Touch beforeAll so the no-op dependency is explicit.
    beforeAll(() => {});
  }
);

if (!reachable) {
  // Surface a single line locally so a developer running `npm test`
  // without `supabase start` knows why the integration block was empty.
  console.warn(
    `[TT-157 integration] Supabase not reachable at ${SUPABASE_URL} — skipping integration suite.`
  );
}

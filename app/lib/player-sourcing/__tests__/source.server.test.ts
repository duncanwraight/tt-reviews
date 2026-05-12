import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogContext } from "~/lib/logger.server";
import { importPlayers } from "../source.server";
import type {
  PlayerCandidate,
  PlayerProvider,
  ProviderResult,
} from "../providers/types";

const ctx = createLogContext("source-test");

function makeCandidate(
  overrides: Partial<PlayerCandidate> = {}
): PlayerCandidate {
  return {
    source: "wtt",
    ittfid: 100,
    name: "Test Player",
    represents: "FRA",
    gender: "M",
    wtt_profile_url:
      "https://www.worldtabletennis.com/playerDescription?playerId=100",
    fetched_at: "2026-05-12T00:00:00.000Z",
    ...overrides,
  };
}

function makeProvider(candidates: PlayerCandidate[]): PlayerProvider {
  return {
    name: "stub",
    fetchCandidates: async (): Promise<ProviderResult> => ({
      status: "ok",
      candidates,
    }),
  };
}

interface FakeSupabaseConfig {
  existingPlayersByIttfid?: {
    ittfid: number;
    name: string;
    represents: string | null;
  }[];
  allPlayers?: { name: string; represents: string | null }[];
  existingProposals?: { ittfid: number; status: string }[];
  upsertReturn?: {
    data: { ittfid: number }[] | null;
    error: { message: string } | null;
  };
  upsertCapture?: { rows?: unknown };
}

function fakeSupabase(config: FakeSupabaseConfig): SupabaseClient {
  const allPlayers = config.allPlayers ?? [];
  const existingByIttfid = config.existingPlayersByIttfid ?? [];
  const existingProposals = config.existingProposals ?? [];

  type Builder = {
    select(_cols: string): Builder;
    in(
      _col: string,
      _vals: unknown[]
    ): Promise<{ data: unknown[]; error: null }> & Builder;
    upsert(
      rows: unknown[],
      _opts: unknown
    ): {
      select(_cols: string): Promise<{
        data: { ittfid: number }[] | null;
        error: { message: string } | null;
      }>;
    };
  };

  let lastSelectCols: string | null = null;

  return {
    from(table: string) {
      const builder: Builder = {
        select(cols: string) {
          lastSelectCols = cols;
          return builder;
        },
        in(_col: string, _vals: unknown[]) {
          let data: unknown[] = [];
          if (table === "player_proposals") data = existingProposals;
          else if (table === "players") {
            // The ittfid-filtered players read uses the
            // "ittfid, name, represents" projection.
            data =
              lastSelectCols === "ittfid, name, represents"
                ? existingByIttfid
                : allPlayers;
          }
          return Object.assign(Promise.resolve({ data, error: null }), builder);
        },
        upsert(rows: unknown[], _opts: unknown) {
          if (config.upsertCapture) {
            config.upsertCapture.rows = rows;
          }
          return {
            select: vi.fn().mockResolvedValue(
              config.upsertReturn ?? {
                data: (rows as { ittfid: number }[]).map(r => ({
                  ittfid: r.ittfid,
                })),
                error: null,
              }
            ),
          };
        },
      };

      // The orchestrator calls `.select("name, represents")` directly
      // without a filter for the all-players dedupe pass — we need that
      // path to resolve to the allPlayers list.
      const selectOverride = builder.select.bind(builder);
      builder.select = (cols: string) => {
        if (table === "players" && cols === "name, represents") {
          // Return a thenable so `await` works without an `.in()`.
          return Object.assign(
            Promise.resolve({ data: allPlayers, error: null }),
            builder
          ) as unknown as Builder;
        }
        return selectOverride(cols);
      };

      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("importPlayers", () => {
  it("inserts every candidate when nothing exists", async () => {
    const candidates = [
      makeCandidate({ ittfid: 1, name: "Alpha" }),
      makeCandidate({ ittfid: 2, name: "Beta" }),
    ];
    const capture: { rows?: unknown } = {};
    const supabase = fakeSupabase({ upsertCapture: capture });

    const result = await importPlayers(supabase, ctx, {
      provider: makeProvider(candidates),
    });

    expect(result.fetched).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.skippedExistingPlayer).toBe(0);
    expect(result.skippedExistingProposal).toBe(0);
    expect((capture.rows as { ittfid: number }[]).map(r => r.ittfid)).toEqual([
      1, 2,
    ]);
  });

  it("skips a candidate whose ittfid already exists on players", async () => {
    const candidates = [
      makeCandidate({ ittfid: 1, name: "Alpha" }),
      makeCandidate({ ittfid: 2, name: "Beta" }),
    ];
    const supabase = fakeSupabase({
      existingPlayersByIttfid: [
        { ittfid: 1, name: "Alpha", represents: "FRA" },
      ],
    });

    const result = await importPlayers(supabase, ctx, {
      provider: makeProvider(candidates),
    });

    expect(result.inserted).toBe(1);
    expect(result.skippedExistingPlayer).toBe(1);
  });

  it("skips a candidate whose (name, represents) already exists under a different ittfid", async () => {
    const candidates = [
      makeCandidate({ ittfid: 999, name: "Hugo Calderano", represents: "BRA" }),
    ];
    const supabase = fakeSupabase({
      allPlayers: [{ name: "Hugo Calderano", represents: "BRA" }],
    });

    const result = await importPlayers(supabase, ctx, {
      provider: makeProvider(candidates),
    });

    expect(result.inserted).toBe(0);
    expect(result.skippedExistingPlayer).toBe(1);
  });

  it("skips candidates whose proposal has already been applied or rejected", async () => {
    const candidates = [
      makeCandidate({ ittfid: 1, name: "Alpha" }),
      makeCandidate({ ittfid: 2, name: "Beta" }),
      makeCandidate({ ittfid: 3, name: "Gamma" }),
    ];
    const supabase = fakeSupabase({
      existingProposals: [
        { ittfid: 1, status: "applied" },
        { ittfid: 2, status: "rejected" },
        { ittfid: 3, status: "pending_review" },
      ],
    });

    const result = await importPlayers(supabase, ctx, {
      provider: makeProvider(candidates),
    });

    expect(result.skippedExistingProposal).toBe(2);
    expect(result.inserted).toBe(1);
  });

  it("returns a zero summary when the provider returns no candidates", async () => {
    const supabase = fakeSupabase({});
    const result = await importPlayers(supabase, ctx, {
      provider: makeProvider([]),
    });
    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
  });

  it("builds merged JSONB with per-field source map and omits empty fields", async () => {
    const capture: { rows?: unknown } = {};
    const supabase = fakeSupabase({ upsertCapture: capture });
    const candidate = makeCandidate({
      ittfid: 42,
      name: "Felix Lebrun",
      represents: "FRA",
      gender: "M",
      handedness: undefined,
      grip: undefined,
    });

    await importPlayers(supabase, ctx, {
      provider: makeProvider([candidate]),
    });

    const rows = capture.rows as { merged: Record<string, unknown> }[];
    const merged = rows[0]!.merged;
    expect(merged.name).toBe("Felix Lebrun");
    expect(merged.represents).toBe("FRA");
    expect(merged.gender).toBe("M");
    expect("handedness" in merged).toBe(false);
    expect("grip" in merged).toBe(false);
    const perFieldSource = merged.per_field_source as Record<string, string>;
    expect(perFieldSource.name).toBe("wtt");
    expect(perFieldSource.represents).toBe("wtt");
    expect(perFieldSource).not.toHaveProperty("handedness");
  });
});

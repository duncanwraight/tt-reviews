import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as search from "../search";
import type { DiscordContext } from "../types";

/**
 * TT-159 unit tests for the search outcomes.
 *
 * The renderers (TT-158) own their own coverage; this file checks the
 * tagged-union outcome shape, the 1.5× ambiguity threshold, the
 * fallback-link composition for zero-match, and that the supabaseAdmin
 * RPC + detail-fetch stubs are invoked the way the dispatch (TT-159)
 * and e2e (TT-161) expect.
 */

interface RpcCall {
  fn: string;
  args: unknown;
}

function makeSupabase(config: {
  rpc?: Record<string, { data?: unknown; error?: { message: string } | null }>;
  tables?: Record<
    string,
    {
      data?: unknown;
      error?: { message: string } | null;
      single?: boolean;
      maybeSingle?: boolean;
    }
  >;
}) {
  const rpcCalls: RpcCall[] = [];
  const fromCalls: RpcCall[] = [];

  const rpc = vi.fn((name: string, args: unknown) => {
    rpcCalls.push({ fn: name, args });
    const entry = config.rpc?.[name];
    return Promise.resolve({
      data: entry?.data ?? null,
      error: entry?.error ?? null,
    });
  });

  const from = vi.fn((table: string) => {
    fromCalls.push({ fn: table, args: null });
    const entry = config.tables?.[table] ?? {};
    const builder = {
      select: (..._args: any[]) => builder,

      eq: (..._args: any[]) => builder,

      order: (..._args: any[]) => builder,
      limit: (_n: number) => builder,
      single: () =>
        Promise.resolve({
          data: entry.data ?? null,
          error: entry.error ?? null,
        }),
      maybeSingle: () =>
        Promise.resolve({
          data: entry.data ?? null,
          error: entry.error ?? null,
        }),
      // Awaiting the builder directly resolves to the row list.
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: entry.data ?? [], error: entry.error ?? null }),
    };
    return builder;
  });

  return {
    rpc,
    from,
    _rpcCalls: rpcCalls,
    _fromCalls: fromCalls,
  };
}

function makeCtx(supabase: ReturnType<typeof makeSupabase>): DiscordContext {
  return {
    env: {
      SITE_URL: "https://tt-reviews.local",
    } as any,

    context: {} as any,

    supabaseAdmin: supabase as any,

    dbService: {} as any,

    moderationService: {} as any,

    unifiedNotifier: {} as any,
  };
}

describe("search.runEquipmentSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns single-match embed outcome when exactly one row matches", async () => {
    const supabase = makeSupabase({
      rpc: {
        search_equipment: {
          data: [
            {
              id: "eq-1",
              name: "Viscaria",
              manufacturer: "Butterfly",
              slug: "butterfly-viscaria",
              category: "blade",
              rank: 0.0608,
            },
          ],
        },
        get_equipment_stats: {
          data: { average_rating: 8.4, total_reviews: 37 },
        },
      },
      tables: {
        equipment: {
          data: {
            id: "eq-1",
            name: "Viscaria",
            manufacturer: "Butterfly",
            slug: "butterfly-viscaria",
            description: "5-ply ALC blade",
            image_key: null,
            image_trim_kind: null,
            specifications: { weight: 86, thickness: 5.7 },
          },
        },
      },
    });
    const result = await search.runEquipmentSearch(
      makeCtx(supabase),
      "viscaria"
    );
    expect(result.kind).toBe("embed");
    if (result.kind !== "embed") return;
    expect(result.outcome).toBe("single");
    expect(result.matchCount).toBe(1);
    expect(result.embed.title).toBe("Viscaria");
    expect(result.embed.url).toBe(
      "https://tt-reviews.local/equipment/butterfly-viscaria"
    );
    expect(supabase.rpc).toHaveBeenCalledWith("search_equipment", {
      query: "viscaria",
    });
  });

  it("returns embed when top result is dominant (rank ratio >= 1.5)", async () => {
    const supabase = makeSupabase({
      rpc: {
        search_equipment: {
          data: [
            {
              id: "eq-1",
              name: "Viscaria",
              manufacturer: "Butterfly",
              slug: "butterfly-viscaria",
              category: "blade",
              rank: 0.3,
            },
            {
              id: "eq-2",
              name: "Other",
              manufacturer: "Butterfly",
              slug: "other",
              category: "blade",
              rank: 0.1,
            },
          ],
        },
        get_equipment_stats: { data: null },
      },
      tables: {
        equipment: {
          data: {
            id: "eq-1",
            name: "Viscaria",
            manufacturer: "Butterfly",
            slug: "butterfly-viscaria",
            description: null,
            image_key: null,
            image_trim_kind: null,
            specifications: null,
          },
        },
      },
    });
    const result = await search.runEquipmentSearch(
      makeCtx(supabase),
      "viscaria"
    );
    expect(result.kind).toBe("embed");
    if (result.kind === "embed") {
      expect(result.outcome).toBe("dominant");
    }
  });

  it("returns ambiguity outcome when no top result is dominant", async () => {
    const supabase = makeSupabase({
      rpc: {
        search_equipment: {
          data: [
            { id: "1", rank: 0.06 },
            { id: "2", rank: 0.06 },
            { id: "3", rank: 0.06 },
            { id: "4", rank: 0.06 },
            { id: "5", rank: 0.06 },
            { id: "6", rank: 0.06 },
          ].map(r => ({
            ...r,
            name: "x",
            manufacturer: "Butterfly",
            slug: "s",
            category: "blade",
          })),
        },
      },
    });
    const result = await search.runEquipmentSearch(
      makeCtx(supabase),
      "butterfly"
    );
    expect(result.kind).toBe("ambiguity");
    if (result.kind !== "ambiguity") return;
    expect(result.outcome).toBe("ambiguous");
    expect(result.matchCount).toBe(6);
    expect(result.content).toContain("butterfly");
    expect(result.content).toContain("`butterfly viscaria`");
  });

  it("returns empty outcome with fallback link when zero rows match", async () => {
    const supabase = makeSupabase({
      rpc: { search_equipment: { data: [] } },
    });
    const result = await search.runEquipmentSearch(makeCtx(supabase), "ksdjfh");
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") return;
    expect(result.outcome).toBe("no-match");
    expect(result.content).toContain("ksdjfh");
    // Fallback uses /search?q= (the only route with a free-text query
    // param) and wraps the URL in <...> to suppress Discord auto-unfurl.
    expect(result.content).toContain(
      "<https://tt-reviews.local/search?q=ksdjfh>"
    );
  });

  it("returns error outcome when the RPC fails", async () => {
    const supabase = makeSupabase({
      rpc: { search_equipment: { error: { message: "db down" } } },
    });
    const result = await search.runEquipmentSearch(makeCtx(supabase), "x");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.outcome).toBe("error");
    }
  });
});

describe("search.runPlayerSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns single-match embed for a unique result, including profile fields", async () => {
    const supabase = makeSupabase({
      rpc: {
        search_players: {
          data: [
            {
              id: "p-1",
              name: "Ma Long",
              slug: "ma-long",
              represents: "CHN",
              rank: 0.06,
            },
          ],
        },
      },
      tables: {
        players: {
          data: {
            id: "p-1",
            name: "Ma Long",
            slug: "ma-long",
            active: false,
            represents: "CHN",
            birth_country: "CHN",
            playing_style: "shakehand_attacker",
            player_kind: "professional",
            peak_world_rank: 1,
            peak_rank_year: 2017,
            peak_rating_value: null,
            peak_rating_year: null,
            active_years: "2003-2024",
            image_key: null,
            image_etag: null,
          },
        },
        // setup + footage + categories all return empty/null — exercise
        // the "no enrichments available" path.
        player_equipment_setups: { data: null },
        player_footage: { data: [] },
        categories: { data: { name: "China", flag_emoji: "🇨🇳" } },
      },
    });
    const result = await search.runPlayerSearch(makeCtx(supabase), "ma long");
    expect(result.kind).toBe("embed");
    if (result.kind !== "embed") return;
    expect(result.embed.title).toBe("Ma Long");
    expect(result.embed.url).toBe("https://tt-reviews.local/players/ma-long");
    expect(result.embed.author?.name).toContain("CHN");
    // Profile lines now live on the embed description (no "Profile"
    // field heading anymore).
    expect(result.embed.description).toContain("Shakehand attacker");
  });

  it("returns ambiguity when multiple equally-ranked rows", async () => {
    const supabase = makeSupabase({
      rpc: {
        search_players: {
          data: [
            { id: "1", rank: 0.06 },
            { id: "2", rank: 0.06 },
          ].map(r => ({
            ...r,
            name: "Harimoto",
            slug: "h",
            represents: "JPN",
          })),
        },
      },
    });
    const result = await search.runPlayerSearch(makeCtx(supabase), "harimoto");
    expect(result.kind).toBe("ambiguity");
  });

  it("returns empty outcome with fallback link", async () => {
    const supabase = makeSupabase({
      rpc: { search_players: { data: [] } },
    });
    const result = await search.runPlayerSearch(makeCtx(supabase), "nobody");
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") return;
    expect(result.content).toContain(
      "<https://tt-reviews.local/search?q=nobody>"
    );
  });
});

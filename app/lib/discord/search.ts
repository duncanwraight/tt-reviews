import { Logger, createLogContext } from "../logger.server";
import { renderEquipmentEmbed } from "./embeds/equipment";
import { renderPlayerEmbed } from "./embeds/player";
import type { DiscordEmbed } from "./embeds/types";
import type { DiscordContext } from "./types";

/**
 * TT-159: search + render entry points used by dispatch.handleSlashCommand.
 *
 * Calls the search_equipment / search_players RPCs from TT-157 directly
 * (instead of going through DatabaseService.searchEquipment which still
 * uses the column-blind .textSearch path). For each hit we then fetch
 * the full row plus, for players, the latest verified setup, top-3
 * active footage, and the country flag emoji from the categories
 * table — everything the C2 renderers need to produce the embed.
 *
 * Returns a tagged outcome the dispatch turns into either an embed
 * followup or an ephemeral content followup. Threshold for treating a
 * multi-result query as a single dominant match is locked at 1.5×
 * top/runner-up ratio per parent TT-156 § Q5 (data captured by the
 * TT-157 integration test). Tunable post-launch via the
 * `discord.search.invocation` log line emitted from each call.
 */

const AMBIGUITY_THRESHOLD = 1.5;
const ZERO_RANK_FLOOR = 1e-6; // Avoid divide-by-zero for ts_rank=0 rows.

export type SearchOutcome =
  | {
      kind: "embed";
      embed: DiscordEmbed;
      outcome: "single" | "dominant";
      topRank: number;
      runnerUpRank: number | null;
      matchCount: number;
    }
  | {
      kind: "ambiguity";
      content: string;
      outcome: "ambiguous";
      topRank: number;
      runnerUpRank: number;
      matchCount: number;
    }
  | {
      kind: "empty";
      content: string;
      outcome: "no-match";
      topRank: null;
      runnerUpRank: null;
      matchCount: 0;
    }
  | {
      kind: "error";
      content: string;
      outcome: "error";
      topRank: null;
      runnerUpRank: null;
      matchCount: 0;
    };

interface SearchEquipmentRow {
  id: string;
  name: string;
  manufacturer: string;
  slug: string;
  category: string;
  rank: number;
}

interface SearchPlayerRow {
  id: string;
  name: string;
  slug: string;
  represents: string | null;
  rank: number;
}

interface EquipmentDetailRow {
  id: string;
  name: string;
  manufacturer: string;
  slug: string;
  description: string | null;
  image_key: string | null;
  image_trim_kind: "auto" | "border" | null;
  specifications: Record<string, unknown> | null;
}

interface PlayerDetailRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  represents: string | null;
  birth_country: string | null;
  playing_style: string | null;
  player_kind: "professional" | "amateur" | null;
  peak_world_rank: number | null;
  peak_rank_year: number | null;
  peak_rating_value: number | null;
  peak_rating_year: number | null;
  active_years: string | null;
  image_key: string | null;
  image_etag: string | null;
}

interface PlayerSetupRow {
  year: number | null;
  forehand_color: "red" | "black" | null;
  backhand_color: "red" | "black" | null;
  blade: { name: string; manufacturer: string } | null;
  forehand_rubber: { name: string; manufacturer: string } | null;
  backhand_rubber: { name: string; manufacturer: string } | null;
}

interface PlayerFootageRow {
  title: string;
  url: string;
}

interface CategoryFlagRow {
  name: string;
  flag_emoji: string | null;
}

/** Extract a sanitised, length-capped query string for log fields. */
function truncateQueryForLog(query: string): string {
  const trimmed = query.trim();
  return trimmed.length > 100 ? trimmed.slice(0, 100) + "…" : trimmed;
}

async function hashUserId(rawId: string | undefined): Promise<string | null> {
  if (!rawId) return null;
  // crypto.subtle is available on Cloudflare Workers and modern Node; the
  // hash is purely so the structured log line doesn't leak Discord IDs
  // into our log store. Truncated to 12 hex chars for readability.
  try {
    const data = new TextEncoder().encode(rawId);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .slice(0, 6)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function siteUrl(ctx: DiscordContext): string {
  // SITE_URL is required by validateEnv, so it's always set in prod.
  // Default kept conservative for local tests that build a partial env.
  return ctx.env.SITE_URL || "https://tabletennis.reviews";
}

/**
 * Equipment search — RPC, ambiguity check, render.
 */
export async function runEquipmentSearch(
  ctx: DiscordContext,
  query: string
): Promise<SearchOutcome> {
  const start = Date.now();
  const logCtx = createLogContext("discord-search", {});

  try {
    const { data, error } = await ctx.supabaseAdmin.rpc("search_equipment", {
      query,
    });
    if (error) throw new Error(`search_equipment RPC: ${error.message}`);

    const rows = (data ?? []) as SearchEquipmentRow[];
    const matchCount = rows.length;

    if (matchCount === 0) {
      const outcome: SearchOutcome = {
        kind: "empty",
        content: emptyMessage("equipment", query, siteUrl(ctx)),
        outcome: "no-match",
        topRank: null,
        runnerUpRank: null,
        matchCount: 0,
      };
      await logInvocation(ctx, "equipment", query, outcome, Date.now() - start);
      return outcome;
    }

    const top = rows[0];
    const runnerUp = rows[1];
    const isDominant = isWinnerDominant(top.rank, runnerUp?.rank);

    if (matchCount > 1 && !isDominant) {
      const outcome: SearchOutcome = {
        kind: "ambiguity",
        content: ambiguityMessage("equipment", query, matchCount),
        outcome: "ambiguous",
        topRank: top.rank,
        runnerUpRank: runnerUp.rank,
        matchCount,
      };
      await logInvocation(ctx, "equipment", query, outcome, Date.now() - start);
      return outcome;
    }

    const detail = await fetchEquipmentDetail(ctx, top.id);
    const reviewStats = await fetchEquipmentReviewStats(ctx, top.id);

    const embed = renderEquipmentEmbed({
      name: detail.name,
      manufacturer: detail.manufacturer,
      slug: detail.slug,
      description: detail.description,
      imageKey: detail.image_key,
      imageTrimKind: detail.image_trim_kind,
      specifications: detail.specifications,
      reviewStats,
      siteUrl: siteUrl(ctx),
    });

    const outcome: SearchOutcome = {
      kind: "embed",
      embed,
      outcome: matchCount === 1 ? "single" : "dominant",
      topRank: top.rank,
      runnerUpRank: runnerUp?.rank ?? null,
      matchCount,
    };
    await logInvocation(ctx, "equipment", query, outcome, Date.now() - start);
    return outcome;
  } catch (err) {
    Logger.error(
      "discord.search.equipment.failed",
      logCtx,
      err instanceof Error ? err : undefined,
      { query: truncateQueryForLog(query) }
    );
    return {
      kind: "error",
      content: "❌ Search error. Please try again later.",
      outcome: "error",
      topRank: null,
      runnerUpRank: null,
      matchCount: 0,
    };
  }
}

/**
 * Player search — RPC, ambiguity check, fetch enrichments, render.
 *
 * Subrequest budget per CLAUDE.md (50-cap on Free):
 *   1. search_players RPC
 *   2. players SELECT (full row by id)
 *   3. player_equipment_setups SELECT (latest verified, joined names)
 *   4. player_footage SELECT (top 3 active)
 *   5. categories SELECT (flag emoji by alpha-3 code)
 * = 5. Well under 50.
 */
export async function runPlayerSearch(
  ctx: DiscordContext,
  query: string
): Promise<SearchOutcome> {
  const start = Date.now();
  const logCtx = createLogContext("discord-search", {});

  try {
    const { data, error } = await ctx.supabaseAdmin.rpc("search_players", {
      query,
    });
    if (error) throw new Error(`search_players RPC: ${error.message}`);

    const rows = (data ?? []) as SearchPlayerRow[];
    const matchCount = rows.length;

    if (matchCount === 0) {
      const outcome: SearchOutcome = {
        kind: "empty",
        content: emptyMessage("player", query, siteUrl(ctx)),
        outcome: "no-match",
        topRank: null,
        runnerUpRank: null,
        matchCount: 0,
      };
      await logInvocation(ctx, "player", query, outcome, Date.now() - start);
      return outcome;
    }

    const top = rows[0];
    const runnerUp = rows[1];
    const isDominant = isWinnerDominant(top.rank, runnerUp?.rank);

    if (matchCount > 1 && !isDominant) {
      const outcome: SearchOutcome = {
        kind: "ambiguity",
        content: ambiguityMessage("player", query, matchCount),
        outcome: "ambiguous",
        topRank: top.rank,
        runnerUpRank: runnerUp.rank,
        matchCount,
      };
      await logInvocation(ctx, "player", query, outcome, Date.now() - start);
      return outcome;
    }

    const [detail, setup, videos, flagEmoji] = await Promise.all([
      fetchPlayerDetail(ctx, top.id),
      fetchPlayerSetup(ctx, top.id),
      fetchPlayerFootage(ctx, top.id),
      fetchFlagEmoji(ctx, top.represents),
    ]);

    const playingStyleLabel = detail.playing_style
      ? humaniseSnakeCase(detail.playing_style)
      : null;

    const embed = renderPlayerEmbed({
      name: detail.name,
      slug: detail.slug,
      represents: detail.represents,
      flagEmoji,
      imageKey: detail.image_key,
      imageEtag: detail.image_etag,
      playingStyleLabel,
      active: detail.active,
      playerKind: detail.player_kind,
      peakWorldRank: detail.peak_world_rank,
      peakRankYear: detail.peak_rank_year,
      peakRatingValue: detail.peak_rating_value,
      peakRatingYear: detail.peak_rating_year,
      ratingCountry: detail.represents ?? detail.birth_country,
      activeYears: detail.active_years,
      setup: setup
        ? {
            blade: setup.blade
              ? {
                  name: setup.blade.name,
                  manufacturer: setup.blade.manufacturer,
                }
              : null,
            forehandRubber: setup.forehand_rubber
              ? {
                  name: setup.forehand_rubber.name,
                  manufacturer: setup.forehand_rubber.manufacturer,
                  color: setup.forehand_color,
                }
              : null,
            backhandRubber: setup.backhand_rubber
              ? {
                  name: setup.backhand_rubber.name,
                  manufacturer: setup.backhand_rubber.manufacturer,
                  color: setup.backhand_color,
                }
              : null,
            year: setup.year ?? null,
          }
        : null,
      videos: videos.map(v => ({ title: v.title, url: v.url })),
      siteUrl: siteUrl(ctx),
    });

    const outcome: SearchOutcome = {
      kind: "embed",
      embed,
      outcome: matchCount === 1 ? "single" : "dominant",
      topRank: top.rank,
      runnerUpRank: runnerUp?.rank ?? null,
      matchCount,
    };
    await logInvocation(ctx, "player", query, outcome, Date.now() - start);
    return outcome;
  } catch (err) {
    Logger.error(
      "discord.search.player.failed",
      logCtx,
      err instanceof Error ? err : undefined,
      { query: truncateQueryForLog(query) }
    );
    return {
      kind: "error",
      content: "❌ Search error. Please try again later.",
      outcome: "error",
      topRank: null,
      runnerUpRank: null,
      matchCount: 0,
    };
  }
}

function isWinnerDominant(top: number, runnerUp: number | undefined): boolean {
  if (runnerUp === undefined) return true;
  if (top <= 0) return false;
  return top / Math.max(runnerUp, ZERO_RANK_FLOOR) >= AMBIGUITY_THRESHOLD;
}

function emptyMessage(
  kind: "equipment" | "player",
  query: string,
  siteUrlValue: string
): string {
  // The /search route is the only one that accepts a free-text `q=`
  // param — /equipment and /players take faceted filters but no
  // text query. Send users to the unified site search.
  // The URL is wrapped in <...> so Discord doesn't auto-unfurl it
  // into an OG-card embed; the link stays clickable, just unpreviewed.
  const safeQuery = encodeURIComponent(query.trim());
  return `🔍 No ${kind} found for "${query.trim()}". Try the site search: <${siteUrlValue}/search?q=${safeQuery}>`;
}

function ambiguityMessage(
  kind: "equipment" | "player",
  query: string,
  matchCount: number
): string {
  const example =
    kind === "equipment"
      ? "`butterfly viscaria`"
      : "a fuller name, e.g. `ma long`";
  return `🔍 Multiple ${kind} match "${query.trim()}" (${matchCount}+ results). Try ${kind === "equipment" ? "including a model name, e.g." : ""} ${example}.`;
}

function humaniseSnakeCase(value: string): string {
  // Sentence case — capitalise only the first letter so multi-word
  // styles read like "Shakehand attacker", matching site convention.
  const spaced = value.replace(/_/g, " ");
  return spaced.length > 0
    ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
    : spaced;
}

async function fetchEquipmentDetail(
  ctx: DiscordContext,
  id: string
): Promise<EquipmentDetailRow> {
  const { data, error } = await ctx.supabaseAdmin
    .from("equipment")
    .select(
      "id, name, manufacturer, slug, description, image_key, image_trim_kind, specifications"
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(`fetchEquipmentDetail: ${error.message}`);
  return data as EquipmentDetailRow;
}

async function fetchEquipmentReviewStats(
  ctx: DiscordContext,
  equipmentId: string
): Promise<{ rating: number; count: number } | null> {
  // No dedicated stats RPC exists — the site computes review aggregates
  // by selecting approved reviews and averaging in JS (see
  // app/lib/database/equipment.ts:280). Mirror that here. Cheap query;
  // stays well within the 50-cap subrequest budget per CLAUDE.md.
  const { data, error } = await ctx.supabaseAdmin
    .from("equipment_reviews")
    .select("overall_rating")
    .eq("equipment_id", equipmentId)
    .eq("status", "approved");
  if (error) {
    Logger.warn(
      "discord.search.equipment.stats-failed",
      createLogContext("discord-search", {}),
      { error: error.message, equipmentId }
    );
    return null;
  }
  const rows = (data ?? []) as Array<{ overall_rating: number }>;
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + r.overall_rating, 0);
  return {
    rating: sum / rows.length,
    count: rows.length,
  };
}

async function fetchPlayerDetail(
  ctx: DiscordContext,
  id: string
): Promise<PlayerDetailRow> {
  const { data, error } = await ctx.supabaseAdmin
    .from("players")
    .select(
      "id, name, slug, active, represents, birth_country, playing_style, player_kind, peak_world_rank, peak_rank_year, peak_rating_value, peak_rating_year, active_years, image_key, image_etag"
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(`fetchPlayerDetail: ${error.message}`);
  return data as PlayerDetailRow;
}

async function fetchPlayerSetup(
  ctx: DiscordContext,
  playerId: string
): Promise<PlayerSetupRow | null> {
  const { data, error } = await ctx.supabaseAdmin
    .from("player_equipment_setups")
    .select(
      `year,
       forehand_color,
       backhand_color,
       blade:blade_id(name, manufacturer),
       forehand_rubber:forehand_rubber_id(name, manufacturer),
       backhand_rubber:backhand_rubber_id(name, manufacturer)`
    )
    .eq("player_id", playerId)
    .eq("verified", true)
    .order("year", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    Logger.warn(
      "discord.search.player.setup-failed",
      createLogContext("discord-search", {}),
      { error: error.message, playerId }
    );
    return null;
  }
  return (data as unknown as PlayerSetupRow | null) ?? null;
}

async function fetchPlayerFootage(
  ctx: DiscordContext,
  playerId: string
): Promise<PlayerFootageRow[]> {
  const { data, error } = await ctx.supabaseAdmin
    .from("player_footage")
    .select("title, url")
    .eq("player_id", playerId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) {
    Logger.warn(
      "discord.search.player.footage-failed",
      createLogContext("discord-search", {}),
      { error: error.message, playerId }
    );
    return [];
  }
  return (data ?? []) as PlayerFootageRow[];
}

async function fetchFlagEmoji(
  ctx: DiscordContext,
  represents: string | null
): Promise<string | null> {
  if (!represents) return null;
  const { data, error } = await ctx.supabaseAdmin
    .from("categories")
    .select("name, flag_emoji")
    .eq("type", "country")
    .eq("value", represents)
    .maybeSingle();
  if (error || !data) return null;
  return (data as CategoryFlagRow).flag_emoji ?? null;
}

async function logInvocation(
  ctx: DiscordContext,
  command: "equipment" | "player",
  query: string,
  outcome: SearchOutcome,
  latencyMs: number
): Promise<void> {
  // Discord ID is on member.user but we don't have access to the full
  // interaction here — this lives in the dispatch context. Skipping the
  // user hash for now; the dispatch layer can layer it on if useful.
  void ctx; // keep parameter for future user-id hashing
  Logger.info(
    "discord.search.invocation",
    createLogContext("discord-search", {}),
    {
      command,
      query: truncateQueryForLog(query),
      outcome: outcome.outcome,
      topRank: outcome.topRank,
      runnerUpRank: outcome.runnerUpRank,
      matchCount: outcome.matchCount,
      latencyMs,
    }
  );
}

// hashUserId exported for the dispatch test harness to verify the user-id
// hash logic if it ever wires into the log line. Keeping it referenced
// here so it doesn't get tree-shaken into a knip warning.
export const _internal = { hashUserId };

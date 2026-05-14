// TT-158: pure player embed renderer.

import { buildPlayerImageUrl } from "~/lib/imageUrl";
import { renderCareerBest } from "~/lib/players/rating-systems";
import type {
  DiscordEmbed,
  DiscordEmbedField,
  PlayerEmbedInput,
  PlayerEmbedSetupInput,
  PlayerEmbedVideoInput,
} from "./types";

const PLAYER_IMAGE_WIDTH = 288;
const VIDEO_LIMIT = 3;
const VIDEO_TITLE_MAX = 80;

function truncateTitle(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function renderProfile(input: PlayerEmbedInput): string | null {
  const lines: string[] = [];
  if (input.playingStyleLabel) {
    lines.push(`**Style:** ${input.playingStyleLabel}`);
  }
  // Active / retired with active years inline. The `active` boolean is
  // authoritative; `active_years` is a free-text label like
  // "2003-2024" or "2017-present".
  const status = input.active ? "Active" : "Retired";
  if (input.activeYears) {
    lines.push(`**${status}:** ${input.activeYears}`);
  } else {
    lines.push(`**Status:** ${status}`);
  }
  const careerBest = renderCareerBest({
    player_kind: input.playerKind ?? "professional",
    peak_world_rank: input.peakWorldRank ?? undefined,
    peak_rank_year: input.peakRankYear ?? undefined,
    peak_rating_value: input.peakRatingValue ?? undefined,
    peak_rating_year: input.peakRatingYear ?? undefined,
    represents: input.ratingCountry ?? input.represents ?? undefined,
  });
  if (careerBest) {
    lines.push(`**${careerBest.label}:** ${careerBest.value}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

const BLADE_EMOJI = "🏓";
const RUBBER_EMOJI = { red: "🔴", black: "⚫" } as const;
const RUBBER_EMOJI_FALLBACK = "•";

function rubberEmoji(color: "red" | "black" | null | undefined): string {
  return color ? RUBBER_EMOJI[color] : RUBBER_EMOJI_FALLBACK;
}

function fullEquipmentName(eq: { name: string; manufacturer: string }): string {
  const manufacturer = eq.manufacturer.trim();
  const name = eq.name.trim();
  // Some catalogue rows have the manufacturer baked into the name
  // (e.g. "Butterfly Tenergy 05"). Avoid double-prefixing in that case.
  if (
    manufacturer &&
    !name.toLowerCase().startsWith(manufacturer.toLowerCase())
  ) {
    return `${manufacturer} ${name}`;
  }
  return name;
}

function renderSetup(
  setup: PlayerEmbedSetupInput | null | undefined
): string | null {
  if (!setup) return null;
  if (!setup.blade && !setup.forehandRubber && !setup.backhandRubber) {
    return null;
  }

  const lines: string[] = [];
  if (setup.blade) {
    lines.push(`${BLADE_EMOJI} (blade) ${fullEquipmentName(setup.blade)}`);
  }
  if (setup.forehandRubber) {
    lines.push(
      `${rubberEmoji(setup.forehandRubber.color)} (FH) ${fullEquipmentName(setup.forehandRubber)}`
    );
  }
  if (setup.backhandRubber) {
    lines.push(
      `${rubberEmoji(setup.backhandRubber.color)} (BH) ${fullEquipmentName(setup.backhandRubber)}`
    );
  }
  if (setup.year) {
    lines.push(`*Since ${setup.year}*`);
  }
  return lines.join("\n");
}

function renderVideos(
  videos: PlayerEmbedVideoInput[] | undefined
): string | null {
  if (!videos || videos.length === 0) return null;
  const formatted = videos
    .slice(0, VIDEO_LIMIT)
    .map(v => `[${truncateTitle(v.title.trim(), VIDEO_TITLE_MAX)}](${v.url})`);
  // Single video reads cleanly as just the link; multiple get bullet
  // markers so each is visibly distinct.
  return formatted.length > 1
    ? formatted.map(line => `- ${line}`).join("\n")
    : formatted.join("\n");
}

function authorName(input: PlayerEmbedInput): string | null {
  const parts: string[] = [];
  if (input.flagEmoji) parts.push(input.flagEmoji);
  if (input.represents) parts.push(input.represents);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function renderPlayerEmbed(input: PlayerEmbedInput): DiscordEmbed {
  const fields: DiscordEmbedField[] = [];
  // TT-221: inline "(Amateur)" suffix in the title so Discord embeds
  // and OG cards mark amateur players without needing a separate
  // pill-style element (Discord doesn't render rich inline chips).
  const title =
    input.playerKind === "amateur" ? `${input.name} (Amateur)` : input.name;
  const embed: DiscordEmbed = {
    title,
    url: `${input.siteUrl}/players/${input.slug}`,
  };

  const author = authorName(input);
  if (author) embed.author = { name: author };

  if (input.imageKey) {
    embed.thumbnail = {
      url: `${input.siteUrl}${buildPlayerImageUrl(input.imageKey, input.imageEtag, PLAYER_IMAGE_WIDTH)}`,
    };
  }

  // Profile lines (style / active / highest rating) go straight under
  // the title as the embed `description` — no "Profile" heading. Cleaner
  // hierarchy: title is the player, three plain lines beneath, then
  // labelled fields below for the things that need a heading.
  const profile = renderProfile(input);
  if (profile) embed.description = profile;

  const setup = renderSetup(input.setup);
  if (setup) fields.push({ name: "Current setup", value: setup });

  const videos = renderVideos(input.videos);
  if (videos) fields.push({ name: "Videos", value: videos });

  if (fields.length > 0) embed.fields = fields;

  embed.footer = {
    text: `${input.siteUrl.replace(/^https?:\/\//, "")}/players/${input.slug}`,
  };

  return embed;
}

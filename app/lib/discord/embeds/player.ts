// TT-158: pure player embed renderer.

import { buildPlayerImageUrl } from "~/lib/imageUrl";
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
  if (input.highestRating) {
    lines.push(`**Highest rating:** ${input.highestRating}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function renderSetup(
  setup: PlayerEmbedSetupInput | null | undefined
): string | null {
  if (!setup) return null;
  const blade = setup.bladeName?.trim();
  const fh = setup.forehandRubberName?.trim();
  const bh = setup.backhandRubberName?.trim();

  // If every slot is empty, the renderer returns null and the caller
  // omits the field. A partial setup (only a blade, say) still
  // renders — placeholder dashes carry the missing-piece signal.
  if (!blade && !fh && !bh) return null;

  const slot = (v: string | undefined) => (v && v.length > 0 ? v : "—");
  const base = `${slot(blade)} / ${slot(fh)} / ${slot(bh)}`;
  return setup.year ? `${base} (since ${setup.year})` : base;
}

function renderVideos(
  videos: PlayerEmbedVideoInput[] | undefined
): string | null {
  if (!videos || videos.length === 0) return null;
  return videos
    .slice(0, VIDEO_LIMIT)
    .map(v => `[${truncateTitle(v.title.trim(), VIDEO_TITLE_MAX)}](${v.url})`)
    .join("\n");
}

function authorName(input: PlayerEmbedInput): string | null {
  const parts: string[] = [];
  if (input.flagEmoji) parts.push(input.flagEmoji);
  if (input.represents) parts.push(input.represents);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function renderPlayerEmbed(input: PlayerEmbedInput): DiscordEmbed {
  const fields: DiscordEmbedField[] = [];
  const embed: DiscordEmbed = {
    title: input.name,
    url: `${input.siteUrl}/players/${input.slug}`,
  };

  const author = authorName(input);
  if (author) embed.author = { name: author };

  if (input.imageKey) {
    embed.thumbnail = {
      url: `${input.siteUrl}${buildPlayerImageUrl(input.imageKey, input.imageEtag, PLAYER_IMAGE_WIDTH)}`,
    };
  }

  const profile = renderProfile(input);
  if (profile) fields.push({ name: "Profile", value: profile });

  const setup = renderSetup(input.setup);
  if (setup) fields.push({ name: "Current setup", value: setup });

  const videos = renderVideos(input.videos);
  if (videos) fields.push({ name: "Recent videos", value: videos });

  if (fields.length > 0) embed.fields = fields;

  embed.footer = {
    text: `${input.siteUrl.replace(/^https?:\/\//, "")}/players/${input.slug}`,
  };

  return embed;
}

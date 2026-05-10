// TT-158: shared types for Discord embed renderers.
//
// The renderers are pure functions: typed input → embed object out.
// Anything dynamic (DB lookups, image-CDN URL composition, flag-emoji
// resolution from the categories table, playing-style label resolution)
// happens in the C3 dispatch layer and is passed in already-resolved.
// Keeping the renderers I/O-free lets them be tested without a DB or a
// running Worker, which is the whole point of this card.

import type { EquipmentImageTrimKind } from "~/lib/imageUrl";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbedMedia {
  url: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: DiscordEmbedAuthor;
  thumbnail?: DiscordEmbedMedia;
  image?: DiscordEmbedMedia;
  fields?: DiscordEmbedField[];
  footer?: DiscordEmbedFooter;
}

export interface EquipmentReviewStats {
  rating: number; // 0-10 scale, as stored in equipment_reviews.overall_rating
  count: number;
}

export interface EquipmentEmbedInput {
  name: string;
  manufacturer: string;
  slug: string;
  description?: string | null;
  imageKey?: string | null;
  imageTrimKind?: EquipmentImageTrimKind;
  // JSONB shape per archive/EQUIPMENT-SPECS.md. Renderer reads only the
  // 12 typed fields it knows about and ignores the rest, so unknown keys
  // are non-breaking.
  specifications?: Record<string, unknown> | null;
  reviewStats?: EquipmentReviewStats | null;
  // e.g. "https://tabletennis.reviews" — Discord requires absolute URLs
  // for embed thumbnails / links, but the rest of the codebase uses
  // origin-relative paths, so the dispatch layer prefixes with SITE_URL.
  siteUrl: string;
}

export interface PlayerEmbedEquipmentInput {
  name: string;
  manufacturer: string;
}

export interface PlayerEmbedRubberInput extends PlayerEmbedEquipmentInput {
  // Color of the sheet on this side. "red" | "black" | null when
  // unknown — color is captured by player_equipment_setups but isn't
  // mandatory, so legacy rows can carry only the rubber identity.
  color?: "red" | "black" | null;
}

export interface PlayerEmbedSetupInput {
  blade?: PlayerEmbedEquipmentInput | null;
  forehandRubber?: PlayerEmbedRubberInput | null;
  backhandRubber?: PlayerEmbedRubberInput | null;
  year?: number | null;
}

export interface PlayerEmbedVideoInput {
  title: string;
  url: string;
}

export interface PlayerEmbedInput {
  name: string;
  slug: string;
  // Pre-resolved flag emoji string (e.g. "🇨🇳"), looked up by the C3
  // dispatch from the configurable_categories table by alpha-3 code.
  flagEmoji?: string | null;
  represents?: string | null; // alpha-3 country code, e.g. "CHN"
  imageKey?: string | null;
  imageEtag?: string | null;
  // Pre-resolved human-readable playing-style label (e.g. "Shakehand
  // attacker"), resolved by C3 from the categories table.
  playingStyleLabel?: string | null;
  active: boolean;
  highestRating?: string | null;
  activeYears?: string | null;
  // Latest verified setup with rubber/blade names already joined in.
  // Pass null / undefined when the player has no verified setup —
  // unverified setups should be filtered out upstream.
  setup?: PlayerEmbedSetupInput | null;
  // Up to 3 active videos, ordered by created_at DESC. Filtering and
  // ordering are the dispatch's responsibility — the renderer just
  // formats whatever it's given (and caps to 3 defensively).
  videos?: PlayerEmbedVideoInput[];
  siteUrl: string;
}

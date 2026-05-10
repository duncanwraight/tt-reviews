// TT-158: pure equipment embed renderer.

import { buildEquipmentImageUrl } from "~/lib/imageUrl";
import { renderRatingStars } from "./rating-stars";
import type {
  DiscordEmbed,
  DiscordEmbedField,
  EquipmentEmbedInput,
} from "./types";

const DESCRIPTION_MAX = 200;

// Order chosen to put the most-asked-about specs first per category.
// Unknown keys in the JSONB are ignored — the renderer reads only the
// 12 fields documented in archive/EQUIPMENT-SPECS.md.
const SPEC_ORDER: ReadonlyArray<{
  key: string;
  label: string;
  format: (raw: unknown) => string | null;
}> = [
  { key: "weight", label: "Weight", format: v => formatNumber(v, "g") },
  { key: "thickness", label: "Thickness", format: v => formatNumber(v, "mm") },
  { key: "plies_wood", label: "Plies (wood)", format: v => formatNumber(v) },
  {
    key: "plies_composite",
    label: "Plies (composite)",
    format: v => formatNumber(v),
  },
  { key: "material", label: "Material", format: formatText },
  { key: "speed", label: "Speed", format: v => formatNumber(v) },
  { key: "control", label: "Control", format: v => formatNumber(v) },
  { key: "spin", label: "Spin", format: v => formatNumber(v) },
  { key: "sponge", label: "Sponge", format: formatText },
  { key: "topsheet", label: "Topsheet", format: formatText },
  { key: "hardness", label: "Hardness", format: formatHardness },
  { key: "year", label: "Year", format: formatText },
];

function formatNumber(raw: unknown, suffix?: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return suffix ? `${raw}${suffix}` : String(raw);
}

function formatText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatHardness(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const min = typeof obj.min === "number" ? obj.min : null;
    const max = typeof obj.max === "number" ? obj.max : null;
    if (min === null && max === null) return null;
    if (min !== null && max !== null) {
      // U+2013 EN DASH — same convention as archive/EQUIPMENT-SPECS.md
      // and the existing site spec table.
      return min === max ? String(min) : `${min}–${max}`;
    }
    return String(min ?? max);
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // U+2026 HORIZONTAL ELLIPSIS — single glyph rather than "..." so the
  // 200-char budget covers visible content, not punctuation.
  return text.slice(0, max - 1).trimEnd() + "…";
}

function renderSpecsField(
  specs: Record<string, unknown> | null | undefined
): string | null {
  if (!specs) return null;
  const lines: string[] = [];
  for (const { key, label, format } of SPEC_ORDER) {
    if (!(key in specs)) continue;
    const formatted = format(specs[key]);
    if (formatted === null) continue;
    lines.push(`**${label}:** ${formatted}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export function renderEquipmentEmbed(input: EquipmentEmbedInput): DiscordEmbed {
  const fields: DiscordEmbedField[] = [];
  const embed: DiscordEmbed = {
    title: input.name,
    url: `${input.siteUrl}/equipment/${input.slug}`,
    author: { name: input.manufacturer },
  };

  if (input.imageKey) {
    // 512px card variant — Discord embed thumbnails render small
    // (~80–100px on desktop, larger on mobile / fullscreen view), so
    // a card-sized source gives a crisp result on all clients without
    // wasting bandwidth on `full`.
    embed.thumbnail = {
      url: `${input.siteUrl}${buildEquipmentImageUrl(input.imageKey, "card", input.imageTrimKind)}`,
    };
  }

  if (input.description) {
    const trimmed = input.description.trim();
    if (trimmed.length > 0) {
      embed.description = truncate(trimmed, DESCRIPTION_MAX);
    }
  }

  const specsValue = renderSpecsField(input.specifications);
  if (specsValue) {
    fields.push({ name: "Manufacturer specs", value: specsValue });
  }

  if (input.reviewStats) {
    const ratingLine = renderRatingStars(
      input.reviewStats.rating,
      input.reviewStats.count
    );
    if (ratingLine !== null) {
      fields.push({ name: "Reviews", value: ratingLine });
    }
  }

  if (fields.length > 0) embed.fields = fields;

  // Footer: domain-only display, since the title is already a link.
  // Strip protocol so it doesn't read as a duplicate URL in the embed.
  embed.footer = {
    text: `${input.siteUrl.replace(/^https?:\/\//, "")}/equipment/${input.slug}`,
  };

  return embed;
}

import type { DiscordNotificationData } from "~/lib/types";
import { getSubmissionConfig } from "./registry";
import type { SubmissionType } from "./types";

// Helper function to create admin URL
export function createAdminUrl(type: SubmissionType, id: string): string {
  const path =
    type === "player_equipment_setup"
      ? "player-equipment-setups"
      : type.replace("_", "-") + "s";
  return `/admin/${path}#${id}`;
}

// Discord field utilities for DRY notification formatting
export const createDiscordField = (
  name: string,
  value: string,
  inline: boolean = true
) => ({
  name,
  value,
  inline,
});

export const createOptionalDiscordField = (
  name: string,
  value: string | undefined,
  inline: boolean = true
) => (value ? [createDiscordField(name, value, inline)] : []);

export const createSubmitterField = (email: string | undefined) =>
  createDiscordField("Submitted by", email || "Anonymous", false);

export const createTruncatedTextField = (
  name: string,
  text: string | undefined,
  maxLength: number = 200
) =>
  text
    ? [
        createDiscordField(
          name,
          text.length > maxLength ? text.substring(0, maxLength) + "..." : text,
          false
        ),
      ]
    : [];

// Render typed equipment.specifications JSONB as a compact "k: v" list for
// Discord. Range values show as `min–max` (or just `min` when equal). Falls
// through to JSON.stringify on shapes that don't match the typed schema —
// belt-and-braces for any in-flight `{notes: "..."}` records pre-TT-76.
export const createSpecificationsField = (
  specs: Record<string, unknown> | null | undefined
) => {
  if (!specs || typeof specs !== "object") return [];
  const entries = Object.entries(specs);
  if (entries.length === 0) return [];

  const formatValue = (raw: unknown): string => {
    if (raw === null || raw === undefined || raw === "") return "—";
    if (
      typeof raw === "object" &&
      raw !== null &&
      "min" in raw &&
      "max" in raw
    ) {
      const r = raw as { min: unknown; max: unknown };
      const min = String(r.min);
      const max = String(r.max);
      return min === max ? min : `${min}–${max}`;
    }
    if (typeof raw === "object") return JSON.stringify(raw);
    return String(raw);
  };

  const lines = entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join("\n");
  return createTruncatedTextField("Specifications", lines, 800);
};

export function formatSubmissionForDiscord(
  type: SubmissionType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): DiscordNotificationData {
  const config = getSubmissionConfig(type);
  if (!config.formatForDiscord) {
    // Fallback for submission types without custom Discord formatting
    return {
      id: data.id || "unknown",
      submissionType: type,
      title: `New ${config.displayName} Submission`,
      description: `A new ${config.displayName.toLowerCase()} has been submitted for review.`,
      color: config.discord.color,
      fields: [{ name: "Status", value: "Pending Review", inline: true }],
      adminUrl: config.adminPath,
    };
  }
  return config.formatForDiscord(data);
}

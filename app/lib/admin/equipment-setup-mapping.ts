/**
 * TT-131: shared bat-side → rubber colour mapping used by both
 * `player_equipment_setup` direct submissions and the cascade from
 * `player` submissions.
 *
 * The form represents physical colour by which side of the bat
 * carries the rubber: "forehand" === red, "backhand" === black,
 * anything else → null. Originally inline in
 * player-equipment-setup-applier.server.ts; lifted here so the player
 * applier reuses it without duplicating the mapping.
 */
export function mapSideToColor(side: unknown): "red" | "black" | null {
  if (side === "forehand") return "red";
  if (side === "backhand") return "black";
  return null;
}

export const ALLOWED_VIDEO_PLATFORMS: ReadonlySet<string> = new Set([
  "youtube",
  "other",
]);

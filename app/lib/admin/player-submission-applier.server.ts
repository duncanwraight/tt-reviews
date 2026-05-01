import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSlug } from "../revspin.server";
import {
  ALLOWED_VIDEO_PLATFORMS,
  mapSideToColor,
} from "./equipment-setup-mapping";

/**
 * Apply an approved player submission by creating the canonical
 * `players` row plus, when the submission carried them, cascade rows
 * in `player_equipment_setups` and `player_footage`.
 *
 * Lives outside the route so unit tests can drive it with a mocked
 * Supabase client and the Discord moderation engine can call it on a
 * second-Discord-approval status flip (TT-111 umbrella).
 *
 * Steps, in order:
 *   1. Read the player_submissions row.
 *   2. INSERT the players row, capturing the new id.
 *   3. If `equipment_setup` JSONB has at least year + blade_id (or
 *      either rubber id), INSERT a player_equipment_setups row with
 *      verified=true so it appears immediately in EquipmentTimeline.
 *   4. If `videos` array is non-empty, INSERT player_footage rows
 *      mirroring applyVideoSubmission's shape.
 *   5. On any cascade INSERT failure, DELETE the just-created players
 *      row so a moderation retry doesn't slug-collide. The submission
 *      stays at status='approved' (the moderation engine flipped it
 *      before this applier ran), but the public-facing players /
 *      cascade rows are absent — the moderator sees the apply error
 *      and can investigate.
 *
 * History: TT-115 punted on the cascade; the original DB trigger
 * (20250618220000_fix_player_creation_trigger.sql) had INSERT logic
 * that the admin-UI rewrite stripped without restoring. TT-131
 * reinstates it, but on real columns rather than the trigger's
 * blade_name string lookup, since equipment_setup now carries
 * blade_id / rubber_id UUIDs.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

export async function applyPlayerSubmission(
  supabaseAdmin: SupabaseClient,
  submissionId: string
): Promise<ApplyResult> {
  const { data: submission, error: readError } = await supabaseAdmin
    .from("player_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (readError || !submission) {
    return {
      success: false,
      error: readError?.message || "Player submission not found",
    };
  }

  const slug = generateSlug(submission.name);

  const { data: insertedPlayer, error: insertError } = await supabaseAdmin
    .from("players")
    .insert({
      name: submission.name,
      slug,
      highest_rating: submission.highest_rating,
      active_years: submission.active_years,
      playing_style: submission.playing_style,
      birth_country: submission.birth_country,
      represents: submission.represents,
      active: true,
      image_key: submission.image_key,
    })
    .select("id")
    .single();

  if (insertError || !insertedPlayer) {
    return {
      success: false,
      error: insertError?.message || "Player insert returned no row",
    };
  }

  const playerId = insertedPlayer.id as string;

  const cascadeError = await cascadeEquipmentAndVideos(
    supabaseAdmin,
    playerId,
    submission
  );
  if (cascadeError) {
    // Compensating delete: roll back the players row so a moderation
    // retry doesn't hit the slug UNIQUE violation. The submission
    // status stays as the engine left it (approved); the moderator
    // sees the cascade error and can re-trigger after fixing the
    // underlying problem.
    await supabaseAdmin.from("players").delete().eq("id", playerId);
    return { success: false, error: cascadeError };
  }

  return { success: true };
}

async function cascadeEquipmentAndVideos(
  supabaseAdmin: SupabaseClient,
  playerId: string,
  submission: Record<string, unknown>
): Promise<string | null> {
  const setup = (submission.equipment_setup ?? {}) as Record<string, unknown>;
  const hasSetup =
    typeof setup === "object" &&
    setup !== null &&
    Object.keys(setup).length > 0 &&
    // year is NOT NULL on player_equipment_setups; without it we can't
    // build a valid row, so skip silently rather than 4xx the apply.
    typeof setup.year === "number" &&
    Number.isFinite(setup.year);

  if (hasSetup) {
    const { error } = await supabaseAdmin
      .from("player_equipment_setups")
      .insert({
        player_id: playerId,
        year: setup.year as number,
        blade_id: (setup.blade_id as string) ?? null,
        forehand_rubber_id: (setup.forehand_rubber_id as string) ?? null,
        forehand_thickness: (setup.forehand_thickness as string) ?? null,
        forehand_color: mapSideToColor(setup.forehand_side),
        backhand_rubber_id: (setup.backhand_rubber_id as string) ?? null,
        backhand_thickness: (setup.backhand_thickness as string) ?? null,
        backhand_color: mapSideToColor(setup.backhand_side),
        source_url: (setup.source_url as string) ?? null,
        source_type: (setup.source_type as string) ?? null,
        verified: true,
      });
    if (error) return error.message;
  }

  const videos = submission.videos;
  if (Array.isArray(videos) && videos.length > 0) {
    const rows = videos
      .filter(
        (v): v is { url: string; title: string; platform?: string } =>
          v !== null &&
          typeof v === "object" &&
          typeof (v as Record<string, unknown>).url === "string" &&
          typeof (v as Record<string, unknown>).title === "string"
      )
      .map(v => ({
        player_id: playerId,
        url: v.url,
        title: v.title,
        platform:
          typeof v.platform === "string" &&
          ALLOWED_VIDEO_PLATFORMS.has(v.platform)
            ? v.platform
            : "other",
        active: true,
      }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("player_footage").insert(rows);
      if (error) return error.message;
    }
  }

  return null;
}

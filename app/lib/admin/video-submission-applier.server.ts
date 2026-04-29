import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TT-116: apply an approved video submission by creating
 * `player_footage` rows for each video in the submission's `videos`
 * JSONB array.
 *
 * Highest-impact entry in the TT-111 umbrella: BOTH paths were
 * previously broken — admin and Discord approval flipped the
 * submission status to "approved" but no player_footage rows were
 * ever created. The original DB trigger
 * (20250622072500_create_video_submissions.sql) had the INSERT logic
 * inline; the 20260101120000_admin_ui_single_approval rewrite stripped
 * it and never reinstated it in the route action. So every approved
 * video submission ever made stops at status='approved' on
 * video_submissions and never reaches the public player_footage
 * table that PlayerTabs reads.
 *
 * Steps:
 *   1. Read the video_submissions row (player_id + videos JSONB).
 *   2. Validate `videos` is a non-empty array. Empty / malformed →
 *      return success with no inserts (defensible — submitter shipped
 *      nothing, applier shouldn't error the moderation flow).
 *   3. Build one player_footage row per `{ url, title, platform }`
 *      entry. Drop entries missing url or title (the submit handler
 *      already filters but defense in depth — bad rows would 4xx the
 *      whole INSERT and surface as "Approved but apply failed").
 *   4. Single INSERT (transactional for the row set: PostgREST treats
 *      an array INSERT as one statement). Partial failure rolls back
 *      the whole batch.
 *
 * `active = true` so the rows surface in PlayerTabs immediately. The
 * submit handler's video objects map straight onto player_footage
 * (url, title, platform). Platform values are constrained to the
 * `video_platform` enum (youtube|other); unknown platforms fall back
 * to 'other'.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

const ALLOWED_PLATFORMS = new Set(["youtube", "other"]);

export async function applyVideoSubmission(
  supabaseAdmin: SupabaseClient,
  submissionId: string
): Promise<ApplyResult> {
  const { data: submission, error: readError } = await supabaseAdmin
    .from("video_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (readError || !submission) {
    return {
      success: false,
      error: readError?.message || "Video submission not found",
    };
  }

  const videos = submission.videos;
  if (!Array.isArray(videos) || videos.length === 0) {
    return { success: true };
  }

  const rows = videos
    .filter(
      (v): v is { url: string; title: string; platform?: string } =>
        v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).url === "string" &&
        typeof (v as Record<string, unknown>).title === "string"
    )
    .map(v => {
      const platform =
        typeof v.platform === "string" && ALLOWED_PLATFORMS.has(v.platform)
          ? v.platform
          : "other";
      return {
        player_id: submission.player_id,
        url: v.url,
        title: v.title,
        platform,
        active: true,
      };
    });

  if (rows.length === 0) {
    return { success: true };
  }

  const { error: insertError } = await supabaseAdmin
    .from("player_footage")
    .insert(rows);

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

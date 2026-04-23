import { Logger } from "~/lib/logger.server";
import type {
  DatabaseContext,
  EquipmentSubmission,
  PlayerSubmission,
} from "./types";
import { withLogging } from "./logging";

export type SubmissionType = "equipment" | "player" | "player_edit" | "video";

export function getSubmissionTableName(submissionType: SubmissionType): string {
  switch (submissionType) {
    case "equipment":
      return "equipment_submissions";
    case "player":
      return "player_submissions";
    case "player_edit":
      return "player_edits";
    case "video":
      return "video_submissions";
    default:
      throw new Error(`Unknown submission type: ${submissionType}`);
  }
}

export async function submitEquipment(
  ctx: DatabaseContext,
  submission: Omit<
    EquipmentSubmission,
    | "id"
    | "created_at"
    | "updated_at"
    | "status"
    | "moderator_id"
    | "moderator_notes"
  >
): Promise<EquipmentSubmission | null> {
  return withLogging<EquipmentSubmission>(
    ctx,
    "submit_equipment",
    () =>
      ctx.supabase
        .from("equipment_submissions")
        .insert({ ...submission, status: "pending" })
        .select()
        .single(),
    { user_id: submission.user_id }
  ).catch(() => null);
}

export async function getUserEquipmentSubmissions(
  ctx: DatabaseContext,
  userId: string
): Promise<EquipmentSubmission[]> {
  return withLogging<EquipmentSubmission[]>(
    ctx,
    "get_user_equipment_submissions",
    () =>
      ctx.supabase
        .from("equipment_submissions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    { userId }
  ).catch((): EquipmentSubmission[] => []);
}

export async function submitPlayer(
  ctx: DatabaseContext,
  submission: Omit<
    PlayerSubmission,
    | "id"
    | "created_at"
    | "updated_at"
    | "status"
    | "moderator_id"
    | "moderator_notes"
  >
): Promise<PlayerSubmission | null> {
  return withLogging<PlayerSubmission>(
    ctx,
    "submit_player",
    () =>
      ctx.supabase
        .from("player_submissions")
        .insert({ ...submission, status: "pending" })
        .select()
        .single(),
    { user_id: submission.user_id }
  ).catch(() => null);
}

export async function getUserPlayerSubmissions(
  ctx: DatabaseContext,
  userId: string
): Promise<PlayerSubmission[]> {
  return withLogging<PlayerSubmission[]>(
    ctx,
    "get_user_player_submissions",
    () =>
      ctx.supabase
        .from("player_submissions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    { userId }
  ).catch((): PlayerSubmission[] => []);
}

/**
 * Look up the Discord message ID previously stored for a submission.
 * Returns null (never throws) so callers can treat "no message to update"
 * and "lookup failed" uniformly — the Logger records the distinction.
 */
export async function getDiscordMessageId(
  ctx: DatabaseContext,
  submissionType: SubmissionType,
  submissionId: string
): Promise<string | null> {
  const logContext = ctx.context || { requestId: "unknown" };
  const tableName = getSubmissionTableName(submissionType);

  const rows = await withLogging<
    Array<{ id: string; discord_message_id: string | null }>
  >(
    ctx,
    "get_discord_message_id",
    () =>
      ctx.supabase
        .from(tableName)
        .select("id, discord_message_id")
        .eq("id", submissionId),
    { submissionType, submissionId }
  ).catch((): Array<{ id: string; discord_message_id: string | null }> => []);

  if (!rows || rows.length === 0) {
    Logger.warn(
      `${submissionType} record ${submissionId} does not exist`,
      logContext,
      { submissionType, submissionId }
    );
    return null;
  }

  if (rows.length > 1) {
    Logger.error(
      `Multiple ${submissionType} records found for ID ${submissionId}`,
      logContext,
      new Error("duplicate submission id"),
      { submissionType, submissionId, count: rows.length }
    );
    return rows[0].discord_message_id;
  }

  const record = rows[0];
  if (!record.discord_message_id) {
    Logger.warn(
      `${submissionType} ${submissionId} has no Discord message ID stored`,
      logContext,
      { submissionType, submissionId }
    );
    return null;
  }

  return record.discord_message_id;
}

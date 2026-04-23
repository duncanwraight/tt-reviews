import { withDatabaseCorrelation } from "~/lib/middleware/correlation.server";
import type {
  DatabaseContext,
  EquipmentSubmission,
  PlayerSubmission,
} from "./types";

export type SubmissionType =
  | "equipment"
  | "player"
  | "player_edit"
  | "video";

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
  const { data, error } = await ctx.supabase
    .from("equipment_submissions")
    .insert({
      ...submission,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error submitting equipment:", error);
    return null;
  }

  return data as EquipmentSubmission;
}

export async function getUserEquipmentSubmissions(
  ctx: DatabaseContext,
  userId: string
): Promise<EquipmentSubmission[]> {
  const { data, error } = await ctx.supabase
    .from("equipment_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user equipment submissions:", error);
    return [];
  }

  return (data as EquipmentSubmission[]) || [];
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
  const { data, error } = await ctx.supabase
    .from("player_submissions")
    .insert({
      ...submission,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error submitting player:", error);
    return null;
  }

  return data as PlayerSubmission;
}

export async function getUserPlayerSubmissions(
  ctx: DatabaseContext,
  userId: string
): Promise<PlayerSubmission[]> {
  const { data, error } = await ctx.supabase
    .from("player_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user player submissions:", error);
    return [];
  }

  return (data as PlayerSubmission[]) || [];
}

/**
 * Discord message-ID tracking methods.
 *
 * Note: the four `update*DiscordMessageId` helpers below do not appear to have
 * any live callers in the codebase today. Extracted as-is during the database
 * split to keep the refactor mechanical — a separate follow-up should audit
 * whether to delete them or wire them up. Migration
 * `20250618141000_add_discord_message_tracking.sql` + the fact that
 * `getDiscordMessageId` is live (called from `app/lib/discord/messages.ts`)
 * suggests writes happen through some path not yet identified.
 */

export async function updateEquipmentSubmissionDiscordMessageId(
  ctx: DatabaseContext,
  submissionId: string,
  messageId: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("equipment_submissions")
    .update({ discord_message_id: messageId })
    .eq("id", submissionId);

  if (error) {
    throw new Error(`Failed to update Discord message ID: ${error.message}`);
  }
}

export async function updatePlayerSubmissionDiscordMessageId(
  ctx: DatabaseContext,
  submissionId: string,
  messageId: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("player_submissions")
    .update({ discord_message_id: messageId })
    .eq("id", submissionId);

  if (error) {
    throw new Error(`Failed to update Discord message ID: ${error.message}`);
  }
}

export async function updateVideoSubmissionDiscordMessageId(
  ctx: DatabaseContext,
  submissionId: string,
  messageId: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("video_submissions")
    .update({ discord_message_id: messageId })
    .eq("id", submissionId);

  if (error) {
    throw new Error(`Failed to update Discord message ID: ${error.message}`);
  }
}

export async function updatePlayerEditDiscordMessageId(
  ctx: DatabaseContext,
  editId: string,
  messageId: string
): Promise<void> {
  const context = ctx.context || { requestId: "unknown" };
  return withDatabaseCorrelation(
    "update_player_edit_discord_message_id",
    async () => {
      const { error } = await ctx.supabase
        .from("player_edits")
        .update({ discord_message_id: messageId })
        .eq("id", editId);

      if (error) {
        throw new Error(
          `Failed to update Discord message ID: ${error.message}`
        );
      }
    },
    context,
    { editId, messageId }
  );
}

export async function getDiscordMessageId(
  ctx: DatabaseContext,
  submissionType: SubmissionType,
  submissionId: string
): Promise<string | null> {
  try {
    const tableName = getSubmissionTableName(submissionType);

    const { data: allRecords, error: countError } = await ctx.supabase
      .from(tableName)
      .select("id, discord_message_id")
      .eq("id", submissionId);

    if (countError) {
      console.error(
        `Database error checking ${submissionType} ${submissionId}:`,
        countError.message
      );
      return null;
    }

    if (!allRecords || allRecords.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`${submissionType} record ${submissionId} does not exist`);
      return null;
    }

    if (allRecords.length > 1) {
      console.error(
        `Multiple ${submissionType} records found for ID ${submissionId}:`,
        allRecords.length
      );
      return allRecords[0].discord_message_id;
    }

    const record = allRecords[0];
    if (!record.discord_message_id) {
      // eslint-disable-next-line no-console
      console.warn(
        `${submissionType} ${submissionId} has no Discord message ID stored`
      );
      return null;
    }

    return record.discord_message_id;
  } catch (error) {
    console.error(
      `Error getting Discord message ID for ${submissionType} ${submissionId}:`,
      error
    );
    return null;
  }
}

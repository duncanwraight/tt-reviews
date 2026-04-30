import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUBMISSION_TYPE_VALUES,
  type SubmissionType,
} from "~/lib/submissions/types";

export type ActivityAction = "approved" | "rejected";

export type ActivitySubmissionType = SubmissionType;

export interface AdminActivityEntry {
  id: string;
  action: ActivityAction;
  submissionType: ActivitySubmissionType;
  submissionId: string;
  /** Display label for the actor — email for admin-UI mods, Discord username
   * for Discord mods, or a short fallback when neither is resolvable. The
   * widget pairs this with `source` for the "(Admin UI)" / "(Discord)"
   * suffix; this string itself does not include that. */
  actor: string;
  /** Where the action originated — admin-UI vs Discord. */
  source: "admin_ui" | "discord" | "unknown";
  createdAt: string;
}

export const ACTIVITY_DEFAULT_LIMIT = 10;

interface ApprovalRow {
  id: string;
  action: string;
  submission_type: string;
  submission_id: string;
  moderator_id: string | null;
  discord_moderator_id: string | null;
  source: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
}

interface DiscordModeratorRow {
  id: string;
  discord_username: string | null;
}

/**
 * Pull the last `limit` admin actions (approve/reject) from
 * `moderator_approvals`, joined with the actor's display label from either
 * `profiles` (admin-UI) or `discord_moderators` (Discord) depending on which
 * id is set on the row.
 *
 * Caller passes an admin/service-role client — this helper does not gate.
 */
export async function getRecentAdminActivity(
  supabase: SupabaseClient,
  limit: number = ACTIVITY_DEFAULT_LIMIT
): Promise<AdminActivityEntry[]> {
  const { data, error } = await supabase
    .from("moderator_approvals")
    .select(
      "id, action, submission_type, submission_id, moderator_id, discord_moderator_id, source, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  const rows = data as ApprovalRow[];
  if (rows.length === 0) return [];

  const moderatorIds = unique(
    rows.map(r => r.moderator_id).filter((v): v is string => v !== null)
  );
  const discordIds = unique(
    rows.map(r => r.discord_moderator_id).filter((v): v is string => v !== null)
  );

  const [profiles, discordMods] = await Promise.all([
    moderatorIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, email")
          .in("id", moderatorIds)
          .then(({ data: rows }) => (rows ?? []) as ProfileRow[])
      : Promise.resolve([] as ProfileRow[]),
    discordIds.length > 0
      ? supabase
          .from("discord_moderators")
          .select("id, discord_username")
          .in("id", discordIds)
          .then(({ data: rows }) => (rows ?? []) as DiscordModeratorRow[])
      : Promise.resolve([] as DiscordModeratorRow[]),
  ]);

  const emailById = new Map(profiles.map(p => [p.id, p.email]));
  const discordNameById = new Map(
    discordMods.map(d => [d.id, d.discord_username])
  );

  return rows.map(row => ({
    id: row.id,
    action: normaliseAction(row.action),
    submissionType: normaliseSubmissionType(row.submission_type),
    submissionId: row.submission_id,
    actor: pickActor(row, emailById, discordNameById),
    source:
      row.source === "admin_ui" || row.source === "discord"
        ? row.source
        : "unknown",
    createdAt: row.created_at,
  }));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normaliseAction(action: string): ActivityAction {
  return action === "rejected" ? "rejected" : "approved";
}

function normaliseSubmissionType(type: string): ActivitySubmissionType {
  return (SUBMISSION_TYPE_VALUES as readonly string[]).includes(type)
    ? (type as ActivitySubmissionType)
    : "equipment";
}

function pickActor(
  row: ApprovalRow,
  emailById: Map<string, string | null>,
  discordNameById: Map<string, string | null>
): string {
  if (row.moderator_id) {
    return emailById.get(row.moderator_id) ?? "Admin";
  }
  if (row.discord_moderator_id) {
    return discordNameById.get(row.discord_moderator_id) ?? "Discord moderator";
  }
  return "Unknown";
}

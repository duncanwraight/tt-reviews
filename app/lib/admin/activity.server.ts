import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUBMISSION_TYPE_VALUES,
  type SubmissionType,
} from "~/lib/submissions/types";
import { generateSlug } from "~/lib/revspin.server";

export type ActivityAction = "approved" | "rejected";

export type ActivitySubmissionType = SubmissionType;

export interface AdminActivityEntry {
  id: string;
  action: ActivityAction;
  submissionType: ActivitySubmissionType;
  submissionId: string;
  /** Display label for the actor — email for admin-UI mods, Discord username
   * for Discord mods, or a short fallback when neither is resolvable. */
  actor: string;
  /** Where the action originated — admin-UI vs Discord. The widget renders
   * a Globe vs Discord icon off this; the suffix text was dropped. */
  source: "admin_ui" | "discord" | "unknown";
  /** Public view-page URL for the entity that was changed (e.g.
   * `/equipment/<slug>` or `/players/<slug>`). Null when the target
   * entity can't be resolved — typically a rejected new-equipment /
   * new-player submission, where no `equipment` / `players` row was
   * ever created. */
  viewUrl: string | null;
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

interface UserEmailRow {
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
 * `auth.users` (admin-UI) or `discord_moderators` (Discord) depending on
 * which id is set on the row.
 *
 * The admin-UI side reads from `auth.users` via the
 * `get_user_emails_by_ids` SECURITY DEFINER RPC. (Historical note:
 * we used to read from `public.profiles.email`, populated by an
 * on-signup trigger — but the trigger only fired on INSERT, so any
 * pre-trigger user or post-signup email change left it stale. The
 * profiles table was dropped in TT-128.)
 *
 * Per-type slug enrichment is batched (one PostgREST call per
 * submission type present in the result). With the dashboard's
 * limit=5 that's at most 5 extra subrequests on top of the 3 base
 * calls — well under the 50-subrequest Workers Free cap (CLAUDE.md).
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

  const idsByType = new Map<ActivitySubmissionType, string[]>();
  for (const row of rows) {
    const type = normaliseSubmissionType(row.submission_type);
    const list = idsByType.get(type) ?? [];
    list.push(row.submission_id);
    idsByType.set(type, list);
  }

  const [users, discordMods, viewUrlBySubmissionId] = await Promise.all([
    moderatorIds.length > 0
      ? supabase
          .rpc("get_user_emails_by_ids", { p_ids: moderatorIds })
          .then(({ data: rows }) => (rows ?? []) as UserEmailRow[])
      : Promise.resolve([] as UserEmailRow[]),
    discordIds.length > 0
      ? supabase
          .from("discord_moderators")
          .select("id, discord_username")
          .in("id", discordIds)
          .then(({ data: rows }) => (rows ?? []) as DiscordModeratorRow[])
      : Promise.resolve([] as DiscordModeratorRow[]),
    resolveViewUrls(supabase, idsByType),
  ]);

  const emailById = new Map(users.map(u => [u.id, u.email]));
  const discordNameById = new Map(
    discordMods.map(d => [d.id, d.discord_username])
  );

  return rows.map(row => {
    const submissionType = normaliseSubmissionType(row.submission_type);
    const action = normaliseAction(row.action);
    return {
      id: row.id,
      action,
      submissionType,
      submissionId: row.submission_id,
      actor: pickActor(row, emailById, discordNameById),
      source:
        row.source === "admin_ui" || row.source === "discord"
          ? row.source
          : "unknown",
      viewUrl: pickViewUrl(
        submissionType,
        row.submission_id,
        action,
        viewUrlBySubmissionId
      ),
      createdAt: row.created_at,
    };
  });
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

/** Result of the per-type slug lookups. Key is `<type>:<submissionId>` so
 * the same submission id can't collide across types. Value is the resolved
 * public `/equipment/...` or `/players/...` URL. */
type ViewUrlMap = Map<string, string>;

interface SlugEmbedRow {
  id: string;
  // PostgREST embeds resolve as either a single nested object (FK -> 1) or
  // null when the FK target doesn't exist. We only use `slug`.
  equipment?: { slug: string | null } | null;
  players?: { slug: string | null } | null;
}

interface NameRow {
  id: string;
  name: string | null;
}

async function resolveViewUrls(
  supabase: SupabaseClient,
  idsByType: Map<ActivitySubmissionType, string[]>
): Promise<ViewUrlMap> {
  const map: ViewUrlMap = new Map();

  await Promise.all(
    Array.from(idsByType.entries()).map(async ([type, ids]) => {
      const uniqueIds = unique(ids);
      if (uniqueIds.length === 0) return;
      const lookups = await fetchSlugs(supabase, type, uniqueIds);
      for (const [submissionId, url] of lookups) {
        map.set(viewUrlKey(type, submissionId), url);
      }
    })
  );

  return map;
}

function viewUrlKey(
  type: ActivitySubmissionType,
  submissionId: string
): string {
  return `${type}:${submissionId}`;
}

async function fetchSlugs(
  supabase: SupabaseClient,
  type: ActivitySubmissionType,
  ids: string[]
): Promise<Array<[string, string]>> {
  switch (type) {
    case "equipment_edit":
      return embedSlugs(
        supabase,
        "equipment_edits",
        "id, equipment:equipment_id(slug)",
        ids,
        "equipment",
        "/equipment/"
      );
    case "review":
      return embedSlugs(
        supabase,
        "equipment_reviews",
        "id, equipment:equipment_id(slug)",
        ids,
        "equipment",
        "/equipment/"
      );
    case "player_edit":
      return embedSlugs(
        supabase,
        "player_edits",
        "id, players:player_id(slug)",
        ids,
        "players",
        "/players/"
      );
    case "video":
      return embedSlugs(
        supabase,
        "video_submissions",
        "id, players:player_id(slug)",
        ids,
        "players",
        "/players/"
      );
    case "player_equipment_setup":
      return embedSlugs(
        supabase,
        "player_equipment_setup_submissions",
        "id, players:player_id(slug)",
        ids,
        "players",
        "/players/"
      );
    case "equipment":
      // New equipment submission — derive slug from the submitted name
      // (matches `applyEquipmentSubmission`'s slug rule). Caller filters
      // out rejected rows so we never produce a 404 link.
      return derivedSlugsFromName(
        supabase,
        "equipment_submissions",
        ids,
        "/equipment/"
      );
    case "player":
      return derivedSlugsFromName(
        supabase,
        "player_submissions",
        ids,
        "/players/"
      );
  }
}

async function embedSlugs(
  supabase: SupabaseClient,
  table: string,
  selectExpr: string,
  ids: string[],
  embedKey: "equipment" | "players",
  prefix: string
): Promise<Array<[string, string]>> {
  const { data, error } = await supabase
    .from(table)
    .select(selectExpr)
    .in("id", ids);
  if (error || !data) return [];
  // PostgREST's typed schema doesn't know our embed shape, so the
  // returned `data` resolves to `GenericStringError[]`. Cast via
  // `unknown` to land on the local row interface.
  const rows = data as unknown as SlugEmbedRow[];
  const out: Array<[string, string]> = [];
  for (const row of rows) {
    const slug = row[embedKey]?.slug;
    if (slug) out.push([row.id, prefix + slug]);
  }
  return out;
}

async function derivedSlugsFromName(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  prefix: string
): Promise<Array<[string, string]>> {
  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .in("id", ids);
  if (error || !data) return [];
  const rows = data as NameRow[];
  const out: Array<[string, string]> = [];
  for (const row of rows) {
    if (!row.name) continue;
    const slug = generateSlug(row.name);
    if (slug) out.push([row.id, prefix + slug]);
  }
  return out;
}

function pickViewUrl(
  type: ActivitySubmissionType,
  submissionId: string,
  action: ActivityAction,
  map: ViewUrlMap
): string | null {
  // Rejected new-entity submissions never produced a real `equipment` /
  // `players` row, so even a derived slug would 404. Suppress the link.
  if (action === "rejected" && (type === "equipment" || type === "player")) {
    return null;
  }
  return map.get(viewUrlKey(type, submissionId)) ?? null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionType } from "./types";

/**
 * Per-type Discord-notification enrichment.
 *
 * `formatForDiscord` (registry.ts) is env-agnostic and pure — it can't
 * fetch related rows. Anything its card expects but isn't on the
 * submission row (the player's name for a video submission, the
 * country's flag emoji for a player submission, the current player
 * row for a player_edit diff) gets pulled here, once, before
 * `DiscordService.notifySubmission` runs.
 *
 * New submission types that need extra context add an entry to
 * `enrichmentHandlers` rather than threading another ad-hoc branch
 * into `submissions.$type.submit.tsx` — the inline-branch pattern is
 * what produced the TT-105 follow-up bug.
 */

type SubmissionRow = Record<string, unknown>;
type Extras = Record<string, unknown>;

type EnrichmentHandler = (
  submission: SubmissionRow,
  adminClient: SupabaseClient
) => Promise<Extras>;

interface EnrichmentInput {
  submission: SubmissionRow;
  submitterEmail: string | undefined;
  adminClient: SupabaseClient;
}

const enrichmentHandlers: Partial<Record<SubmissionType, EnrichmentHandler>> = {
  review: async (submission, adminClient) => {
    if (!submission.equipment_id) return {};
    const { data: equipment } = (await adminClient
      .from("equipment")
      .select("name")
      .eq("id", submission.equipment_id as string)
      .single()) as { data: { name: string } | null };
    return equipment ? { equipment_name: equipment.name } : {};
  },

  video: async (submission, adminClient) => {
    if (!submission.player_id) return {};
    const { data: player } = (await adminClient
      .from("players")
      .select("name")
      .eq("id", submission.player_id as string)
      .single()) as { data: { name: string } | null };
    return player ? { player_name: player.name } : {};
  },

  equipment_edit: async (submission, adminClient) => {
    if (!submission.equipment_id) return {};
    // The full current row enables the formatter's before→after diff
    // rendering — it doesn't just need the name.
    const { data: equipment } = (await adminClient
      .from("equipment")
      .select(
        "name, slug, category, subcategory, description, specifications, image_key"
      )
      .eq("id", submission.equipment_id as string)
      .single()) as { data: Record<string, unknown> | null };
    if (!equipment) return {};
    return {
      equipment_name: equipment.name as string,
      equipment_current: equipment,
    };
  },
};

export async function enrichSubmissionForNotification(
  type: SubmissionType,
  input: EnrichmentInput
): Promise<SubmissionRow> {
  const base: SubmissionRow = {
    ...input.submission,
    submitter_email: input.submitterEmail,
  };
  const handler = enrichmentHandlers[type];
  if (!handler) return base;
  const extras = await handler(input.submission, input.adminClient);
  return { ...base, ...extras };
}

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

  player: async (submission, adminClient) => {
    const extras: Extras = {};
    // Categories.value for type="country" stores the same 3-letter
    // code that player_submissions.{birth_country,represents} carry,
    // so we can join them in one in() query.
    const countryValues = [
      submission.birth_country,
      submission.represents,
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    if (countryValues.length === 0) return extras;

    const { data: rows } = (await adminClient
      .from("categories")
      .select("value, flag_emoji, name")
      .eq("type", "country")
      .in("value", countryValues)) as {
      data: Array<{
        value: string;
        flag_emoji: string | null;
        name: string;
      }> | null;
    };
    const byValue = new Map((rows ?? []).map(r => [r.value, r]));

    if (submission.birth_country) {
      const c = byValue.get(submission.birth_country as string);
      if (c) {
        if (c.flag_emoji) extras.birth_country_flag = c.flag_emoji;
        extras.birth_country_name = c.name;
      }
    }
    if (submission.represents) {
      const c = byValue.get(submission.represents as string);
      if (c) {
        if (c.flag_emoji) extras.represents_flag = c.flag_emoji;
        extras.represents_name = c.name;
      }
    }
    return extras;
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

  player_equipment_setup: async (submission, adminClient) => {
    const extras: Extras = {};

    if (submission.player_id) {
      const { data: player } = (await adminClient
        .from("players")
        .select("name")
        .eq("id", submission.player_id as string)
        .single()) as { data: { name: string } | null };
      if (player) extras.player_name = player.name;
    }

    // Batch the three equipment lookups (blade + forehand + backhand)
    // into one `in (...)` query so we don't fan out a round-trip per
    // rubber. The ids may be missing — only filter to the ones set.
    const equipmentIds = [
      submission.blade_id,
      submission.forehand_rubber_id,
      submission.backhand_rubber_id,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);

    if (equipmentIds.length > 0) {
      const { data: rows } = (await adminClient
        .from("equipment")
        .select("id, name")
        .in("id", equipmentIds)) as {
        data: Array<{ id: string; name: string }> | null;
      };
      const nameById = new Map((rows ?? []).map(r => [r.id, r.name]));
      if (submission.blade_id) {
        extras.blade_name = nameById.get(submission.blade_id as string);
      }
      if (submission.forehand_rubber_id) {
        extras.forehand_rubber_name = nameById.get(
          submission.forehand_rubber_id as string
        );
      }
      if (submission.backhand_rubber_id) {
        extras.backhand_rubber_name = nameById.get(
          submission.backhand_rubber_id as string
        );
      }
    }

    return extras;
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

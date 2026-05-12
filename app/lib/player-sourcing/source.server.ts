// Player importer orchestrator (TT-168 / TT-198).
//
// Fetches candidates from the configured provider (default: WTT roster),
// dedupes against existing `players` rows, and upserts the survivors
// into `player_proposals`. The admin review UI (TT-199) handles the
// approve/reject step that materialises a `players` row.
//
// Dedupe rules:
//   1. ittfid match against an existing `players` row → skip.
//   2. normalised (name, represents) match → skip (same player listed
//      under a different ittfid upstream, rare but seen on retirees
//      who got re-issued an id).
//   3. proposal with status in ('applied', 'rejected') exists for this
//      ittfid → skip (moderator decision sticks; re-running shouldn't
//      undo it).
//
// All Supabase calls go through the service-role client; RLS bypassed
// by design (player_proposals has no policies for non-service roles).

import type { SupabaseClient } from "@supabase/supabase-js";
import { Logger, type LogContext } from "~/lib/logger.server";

import type { PlayerCandidate, PlayerProvider } from "./providers/types";
import { wttProvider } from "./providers/wtt";

export interface ImportPlayersOptions {
  provider?: PlayerProvider;
  fetchImpl?: typeof fetch;
  limit?: number;
}

export interface ImportPlayersResult {
  fetched: number;
  inserted: number;
  skippedExistingPlayer: number;
  skippedExistingProposal: number;
  errors: string[];
}

interface ExistingPlayer {
  ittfid: number | null;
  name: string;
  represents: string | null;
}

interface ExistingProposal {
  ittfid: number;
  status: string;
}

function dedupeKey(
  name: string,
  represents: string | null | undefined
): string {
  const country = (represents ?? "").toUpperCase().trim();
  return `${name.toLowerCase().trim()}|${country}`;
}

function buildProposalRow(candidate: PlayerCandidate): {
  ittfid: number;
  merged: Record<string, unknown>;
  candidates: Record<string, unknown>;
  status: "pending_review";
} {
  const perFieldSource: Record<string, string> = {};
  const mergedFields: Record<string, unknown> = {};

  const sourceLabel = candidate.source;

  function take<K extends keyof PlayerCandidate>(key: K): void {
    const value = candidate[key];
    if (value === undefined || value === null || value === "") return;
    mergedFields[key as string] = value;
    perFieldSource[key as string] = sourceLabel;
  }

  take("name");
  take("represents");
  take("birth_country");
  take("gender");
  take("handedness");
  take("grip");
  take("highest_rating");
  take("active_years");
  take("wtt_profile_url");
  take("image_source_url");

  mergedFields.per_field_source = perFieldSource;

  return {
    ittfid: candidate.ittfid,
    merged: mergedFields,
    candidates: { [sourceLabel]: candidate },
    status: "pending_review",
  };
}

export async function importPlayers(
  supabaseAdmin: SupabaseClient,
  ctx: LogContext,
  options: ImportPlayersOptions = {}
): Promise<ImportPlayersResult> {
  const provider = options.provider ?? wttProvider;
  const errors: string[] = [];

  const providerResult = await provider.fetchCandidates({
    fetchImpl: options.fetchImpl,
    limit: options.limit,
  });
  const candidates = providerResult.candidates;
  Logger.info("admin.players-import.fetched", ctx, {
    provider: provider.name,
    fetched: candidates.length,
  });

  if (candidates.length === 0) {
    return {
      fetched: 0,
      inserted: 0,
      skippedExistingPlayer: 0,
      skippedExistingProposal: 0,
      errors,
    };
  }

  const ittfids = candidates.map(c => c.ittfid);

  const playersResp = await supabaseAdmin
    .from("players")
    .select("ittfid, name, represents")
    .in("ittfid", ittfids);
  const playersByIttfid = new Map<number, ExistingPlayer>();
  const playersByDedupeKey = new Set<string>();
  if (playersResp.error) {
    throw new Error(`load players: ${playersResp.error.message}`);
  }
  for (const row of (playersResp.data ?? []) as ExistingPlayer[]) {
    if (typeof row.ittfid === "number") {
      playersByIttfid.set(row.ittfid, row);
    }
    playersByDedupeKey.add(dedupeKey(row.name, row.represents));
  }

  const allPlayersResp = await supabaseAdmin
    .from("players")
    .select("name, represents");
  if (allPlayersResp.error) {
    throw new Error(`load player dedupe set: ${allPlayersResp.error.message}`);
  }
  for (const row of (allPlayersResp.data ?? []) as Pick<
    ExistingPlayer,
    "name" | "represents"
  >[]) {
    playersByDedupeKey.add(dedupeKey(row.name, row.represents));
  }

  const proposalsResp = await supabaseAdmin
    .from("player_proposals")
    .select("ittfid, status")
    .in("ittfid", ittfids);
  if (proposalsResp.error) {
    throw new Error(`load proposals: ${proposalsResp.error.message}`);
  }
  const decidedProposals = new Set<number>();
  for (const row of (proposalsResp.data ?? []) as ExistingProposal[]) {
    if (row.status === "applied" || row.status === "rejected") {
      decidedProposals.add(row.ittfid);
    }
  }

  let skippedExistingPlayer = 0;
  let skippedExistingProposal = 0;
  const proposalRows: ReturnType<typeof buildProposalRow>[] = [];

  for (const candidate of candidates) {
    if (playersByIttfid.has(candidate.ittfid)) {
      skippedExistingPlayer += 1;
      continue;
    }
    if (
      playersByDedupeKey.has(dedupeKey(candidate.name, candidate.represents))
    ) {
      skippedExistingPlayer += 1;
      continue;
    }
    if (decidedProposals.has(candidate.ittfid)) {
      skippedExistingProposal += 1;
      continue;
    }
    proposalRows.push(buildProposalRow(candidate));
  }

  let inserted = 0;
  if (proposalRows.length > 0) {
    const upsertResp = await supabaseAdmin
      .from("player_proposals")
      .upsert(proposalRows, { onConflict: "ittfid" })
      .select("ittfid");
    if (upsertResp.error) {
      throw new Error(`upsert proposals: ${upsertResp.error.message}`);
    }
    inserted = upsertResp.data?.length ?? 0;
  }

  const result: ImportPlayersResult = {
    fetched: candidates.length,
    inserted,
    skippedExistingPlayer,
    skippedExistingProposal,
    errors,
  };

  Logger.info("admin.players-import.completed", ctx, {
    provider: provider.name,
    ...result,
  });

  return result;
}

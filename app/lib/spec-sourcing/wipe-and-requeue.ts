// Pure helpers for the local TT-165 wipe-and-requeue script
// (scripts/spec-sourcing/wipe-and-requeue.ts). Lives under app/lib/ so
// vitest's include glob picks up the unit tests; no Worker runtime
// coupling — it just talks to Supabase via PostgREST.

import type { SupabaseClient } from "@supabase/supabase-js";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "tt-reviews.local"]);

export interface ParsedArgs {
  confirmProd: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  return { confirmProd: argv.includes("--confirm-prod") };
}

export function isLocalSupabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return LOCAL_HOSTNAMES.has(parsed.hostname);
}

export interface WipeResult {
  proposals: number;
  equipment: number;
}

export async function wipeSpecSourcingState(
  supabase: SupabaseClient
): Promise<WipeResult> {
  // PostgREST refuses delete-without-filter; `not('id', 'is', null)`
  // matches every row because id is NOT NULL on the table. Same shape
  // for the equipment update, which has to touch every row.
  const { data: proposals, error: proposalsError } = await supabase
    .from("equipment_spec_proposals")
    .delete()
    .not("id", "is", null)
    .select("id");
  if (proposalsError) {
    throw new Error(
      `Failed to delete equipment_spec_proposals: ${proposalsError.message}`
    );
  }

  const { data: equipment, error: equipmentError } = await supabase
    .from("equipment")
    .update({ specs_sourced_at: null, specs_source_status: null })
    .not("id", "is", null)
    .select("id");
  if (equipmentError) {
    throw new Error(
      `Failed to reset equipment cooldown: ${equipmentError.message}`
    );
  }

  return {
    proposals: proposals?.length ?? 0,
    equipment: equipment?.length ?? 0,
  };
}

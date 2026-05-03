// Round-trip the applied manufacturer-spec data from the local DB
// into the SPEC-SOURCING block of supabase/seed.sql (TT-151, closes
// TT-78). Mirrors scripts/photo-sourcing/export-seed.ts in shape.
//
// What gets exported: equipment rows whose specs_source_status =
// 'fresh' (i.e. an admin-applied proposal landed). Each row's
// per_field_source map comes from the most recent applied proposal so
// the seed can carry a -- src: citation comment per row.
//
// Idempotent: re-running with no DB changes leaves seed.sql byte-
// identical. Verifiable via `git diff --exit-code supabase/seed.sql`.
//
// Usage:
//   npm run sourcing:export-specs
// or
//   node --experimental-strip-types scripts/spec-sourcing/export-seed.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSeedBlock,
  spliceBlock,
  type SpecSeedRow,
} from "../../app/lib/spec-sourcing/seed-block.ts";
import { createServiceClient } from "../photo-sourcing/lib/db.ts";

const SEED_SQL = resolve(process.cwd(), "supabase/seed.sql");

interface RawJoinRow {
  slug: string;
  specifications: Record<string, unknown> | null;
  description: string | null;
  proposal: {
    merged: { per_field_source?: Record<string, string> } | null;
  } | null;
}

async function loadAppliedRows(client: SupabaseClient): Promise<SpecSeedRow[]> {
  // Embed the applied proposal so we can pull per_field_source in one
  // round-trip. PostgREST !inner forces an INNER JOIN — equipment rows
  // without an applied proposal drop out. equipment_id is UNIQUE on
  // the proposal table, so the embed returns a single row per
  // equipment row (when a row has been re-proposed and re-applied,
  // the table holds only the most recent merged blob — see TT-149).
  const { data, error } = await client
    .from("equipment")
    .select(
      "slug, specifications, description, proposal:equipment_spec_proposals!inner(merged)"
    )
    .eq("specs_source_status", "fresh")
    .eq("equipment_spec_proposals.status", "applied")
    .order("slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to load applied equipment rows: ${error.message}`);
  }

  const rows = (data ?? []) as RawJoinRow[];
  return rows.map(row => ({
    slug: row.slug,
    specifications: row.specifications ?? {},
    description: row.description,
    per_field_source: row.proposal?.merged?.per_field_source ?? {},
  }));
}

async function main(): Promise<void> {
  const client = createServiceClient();
  const rows = await loadAppliedRows(client);

  process.stdout.write(
    `Found ${rows.length} equipment rows with applied spec proposals.\n`
  );

  const block = buildSeedBlock(rows);
  const seed = readFileSync(SEED_SQL, "utf8");
  const next = spliceBlock(seed, block);

  if (next === seed) {
    process.stdout.write("seed.sql unchanged — nothing to write.\n");
    return;
  }

  writeFileSync(SEED_SQL, next, "utf8");
  process.stdout.write(`Wrote ${SEED_SQL}\n`);
}

main().catch(err => {
  process.stderr.write(`export-seed failed: ${(err as Error).message}\n`);
  process.exit(1);
});

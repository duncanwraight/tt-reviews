// Roundtrip the current `image_*` state of `players` + `equipment`
// from the local DB into the PHOTO-SOURCING-CREDITS block of
// supabase/seed.sql. Closes the loop opened by TT-48: equipment
// images are picked from the admin UI (not via the manifest pipeline
// that TT-36 uses for players), so without this script a `supabase
// db reset` would wipe them.
//
// Players also flow through here so a single regeneration covers
// both tables — apply.ts (TT-36) writes the same block when run; the
// scripts agree because both read from the same DB state.
//
// Idempotent: re-running with no DB changes leaves seed.sql byte-
// identical (verifiable via `git diff --exit-code supabase/seed.sql`).
//
// Usage:
//   npm run images:export-seed
// or
//   node --experimental-strip-types scripts/photo-sourcing/export-seed.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./lib/db.ts";
import {
  buildSeedBlock,
  spliceBlock,
  type SeedRow,
} from "../../app/lib/photo-sourcing/seed-block.ts";

const SEED_SQL = resolve(process.cwd(), "supabase/seed.sql");

async function loadRowsFor(
  client: SupabaseClient,
  table: "players" | "equipment"
): Promise<SeedRow[]> {
  const { data, error } = await client
    .from(table)
    .select(
      "slug, image_key, image_etag, image_credit_text, image_credit_link, image_license_short, image_license_url, image_source_url"
    )
    .not("image_key", "is", null)
    .order("slug", { ascending: true });
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  return (data ?? []) as SeedRow[];
}

async function main(): Promise<void> {
  const client = createServiceClient();
  const [players, equipment] = await Promise.all([
    loadRowsFor(client, "players"),
    loadRowsFor(client, "equipment"),
  ]);

  process.stdout.write(
    `Found ${players.length} players + ${equipment.length} equipment with image_key.\n`
  );

  const block = buildSeedBlock({ players, equipment });
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

// Wipe spec-sourcing state so the cron re-attempts every equipment row.
// Use case: a sourcing bug shipped (e.g. TT-164's Butterfly query),
// every equipment row carries a stale `specs_sourced_at` cooldown stamp
// + a `no_results` or `pending_review` proposal, and the cron's
// `pick_spec_source_batch` won't re-pick them until the cooldown elapses
// (6 months for `fresh`, 14 days for `no_results`). This script clears
// the slate.
//
// What it does:
//   1. DELETE FROM equipment_spec_proposals  (all rows, all statuses)
//   2. UPDATE equipment SET specs_sourced_at = NULL, specs_source_status = NULL
//
// What it does NOT do: enqueue messages directly. queue.send is only
// available inside the Cloudflare Worker runtime; a Node script can't
// reach the binding. Instead, the next cron tick (`0 */6 * * *` —
// `pick_spec_source_batch` LIMIT 20) picks the rows up. Trigger one
// immediately by curling wrangler dev's scheduled handler:
//   curl 'http://tt-reviews.local:8787/__scheduled?cron=0+*/6+*+*+*'
//
// Production safety: refuses to run unless SUPABASE_URL points at a
// known-local host (127.0.0.1, localhost, tt-reviews.local). Pass
// --confirm-prod to override (don't).
//
// Heads-up: `applied` proposals are wiped too. The seed exporter
// (scripts/spec-sourcing/export-seed.ts) joins through that table to
// recover per_field_source citations. Re-running the exporter before
// rows have been re-applied will emit a near-empty SPEC-SOURCING block
// and overwrite supabase/seed.sql. Don't run the exporter until
// re-application is complete.
//
// Usage:
//   npm run sourcing:requeue-all
// or
//   node --experimental-strip-types scripts/spec-sourcing/wipe-and-requeue.ts

import {
  isLocalSupabaseUrl,
  parseArgs,
  wipeSpecSourcingState,
} from "../../app/lib/spec-sourcing/wipe-and-requeue.ts";
import { createServiceClient } from "../photo-sourcing/lib/db.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? "";
  const local = isLocalSupabaseUrl(url);

  if (!local && !args.confirmProd) {
    process.stderr.write(
      `Refusing to run: SUPABASE_URL (${url || "<unset>"}) is not a known ` +
        `local host. Pass --confirm-prod to override.\n`
    );
    process.exit(1);
  }
  if (!local && args.confirmProd) {
    process.stderr.write(
      `WARNING: --confirm-prod set; running against ${url}. Ctrl-C now if ` +
        `that's not what you meant.\n`
    );
  }

  const client = createServiceClient();
  const result = await wipeSpecSourcingState(client);

  process.stdout.write(
    `Deleted ${result.proposals} proposals; reset ${result.equipment} equipment rows.\n` +
      `Next cron tick (every 6h) will pick rows up 20 at a time. Trigger one now:\n` +
      `  curl 'http://tt-reviews.local:8787/__scheduled?cron=0+*/6+*+*+*'\n`
  );
}

main().catch(err => {
  process.stderr.write(`wipe-and-requeue failed: ${(err as Error).message}\n`);
  process.exit(1);
});

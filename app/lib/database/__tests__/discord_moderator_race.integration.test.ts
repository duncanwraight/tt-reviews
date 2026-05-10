// TT-185: integration test that drives true concurrency at
// get_or_create_discord_moderator. Hits live Supabase at SUPABASE_URL
// using the anon key — the function is SECURITY DEFINER and granted
// EXECUTE to anon/authenticated, so this round-trips through PostgREST
// the same way the Worker's service-role client does.
//
// Why this layer specifically: pgTAP runs in a single transaction, so
// it can model the *behaviour* the new ON CONFLICT DO UPDATE statement
// guarantees but it can't actually drive concurrent calls. Only a
// PostgREST-driven Promise.all can — that's what hits two distinct
// connections at the same statement and reproduces the SELECT-then-
// INSERT race the legacy implementation had.
//
// Skip behaviour mirrors search.integration.test.ts: skip if Supabase
// isn't reachable within ~30s. Per CLAUDE.md memory, "DB not running"
// is the only acceptable local skip.
//
// Cleanup note: each invocation generates a fresh discord_user_id with
// crypto.randomUUID(), so concurrent test runs and prior runs can't
// collide. Rows accumulate in the local discord_moderators table at a
// rate of ~1 per test run; treat them as test residue cleared by
// `supabase db reset`. Anon can't DELETE under the RLS policies, so we
// don't try.

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function isReachable(): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      if (res.status < 500) return true;
    } catch {
      // network error — keep waiting
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

const reachable = await isReachable();

describe.skipIf(!reachable)(
  "get_or_create_discord_moderator race-safety (integration, hits local Supabase)",
  () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function callRpc(
      discordUserId: string,
      discordUsername?: string
    ): Promise<{ data: string | null; error: unknown }> {
      const { data, error } = await supabase.rpc(
        "get_or_create_discord_moderator",
        {
          p_discord_user_id: discordUserId,
          p_discord_username: discordUsername ?? null,
        }
      );
      return { data: data as string | null, error };
    }

    it("N concurrent calls for a fresh discord_user_id all return the same UUID with no errors", async () => {
      const N = 20;
      const discordUserId = `tt185-race-${crypto.randomUUID()}`;

      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          callRpc(discordUserId, `race-tester-${i}`)
        )
      );

      // No error on any call — the legacy implementation would return
      // {data: null, error: null} for the loser of the race because the
      // SELECT-then-INSERT path silently swallowed the conflict and
      // returned NULL. Both shapes (null data, non-null error) fail the
      // assertion below.
      const errors = results
        .map((r, i) => ({ i, error: r.error }))
        .filter(r => r.error !== null && r.error !== undefined);
      expect(errors).toEqual([]);

      const ids = results.map(r => r.data);
      expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(
        true
      );

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);

      // Exactly one row exists for that discord_user_id — a race that
      // double-inserted would either error (unique violation) or, if
      // the unique index were missing, leave two rows behind.
      const { data: rows, error: selectError } = await supabase
        .from("discord_moderators")
        .select("id")
        .eq("discord_user_id", discordUserId);
      expect(selectError).toBeNull();
      expect(rows).toHaveLength(1);
      expect(rows![0].id).toBe(ids[0]);
    });

    it("a sequential second call after the first returns the same UUID (idempotent update path)", async () => {
      const discordUserId = `tt185-seq-${crypto.randomUUID()}`;

      const first = await callRpc(discordUserId, "seq-first");
      expect(first.error).toBeNull();
      expect(first.data).toBeTruthy();

      const second = await callRpc(discordUserId, "seq-second");
      expect(second.error).toBeNull();
      expect(second.data).toBe(first.data);

      // The second call's username param overwrites the first's stored
      // value — the COALESCE rule applies to NULL params, not non-NULL.
      const { data: row } = await supabase
        .from("discord_moderators")
        .select("discord_username")
        .eq("discord_user_id", discordUserId)
        .single();
      expect(row?.discord_username).toBe("seq-second");
    });
  }
);

if (!reachable) {
  console.warn(
    `[TT-185 integration] Supabase not reachable at ${SUPABASE_URL} — skipping integration suite.`
  );
}

// Local Supabase client for the photo-sourcing scripts.
//
// We talk to the local stack via the service-role key — these scripts
// run on a developer's box, not in CI or in the Worker. The connection
// details come from `supabase status -o env` (or env overrides) so a
// `supabase db reset` rotates them automatically.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

interface SupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

function resolveSupabaseEnv(): SupabaseEnv {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, serviceRoleKey: envKey };
  }

  // Fall back to `supabase status` so the dev workflow is one command.
  let raw: string;
  try {
    raw = execSync("supabase status -o env", { encoding: "utf8" });
  } catch {
    throw new Error(
      "Local Supabase not running. Start it with `supabase start` " +
        "or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const url = parseEnvLine(raw, "API_URL");
  const serviceRoleKey = parseEnvLine(raw, "SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Could not parse SUPABASE env from `supabase status`.");
  }
  return { url, serviceRoleKey };
}

function parseEnvLine(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^${key}="?(.*?)"?$`, "m"));
  return match ? match[1] : null;
}

export function createServiceClient(): SupabaseClient {
  const env = resolveSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SeedPlayer {
  id: string;
  slug: string;
  name: string;
  birth_country: string | null;
  represents: string | null;
  active_years: string | null;
  image_key: string | null;
}

export async function loadAllPlayers(
  client: SupabaseClient
): Promise<SeedPlayer[]> {
  const { data, error } = await client
    .from("players")
    .select(
      "id, slug, name, birth_country, represents, active_years, image_key"
    )
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load players: ${error.message}`);
  return (data ?? []) as SeedPlayer[];
}

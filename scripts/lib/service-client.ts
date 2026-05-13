// Shared local-Supabase service-role client factory for the
// developer-side scripts under scripts/. Connects to the local
// Supabase stack via `supabase status -o env` (with env-var overrides)
// so a `supabase db reset` rotates credentials automatically.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

interface SupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

function parseEnvLine(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^${key}="?(.*?)"?$`, "m"));
  return match ? match[1] : null;
}

function resolveSupabaseEnv(): SupabaseEnv {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, serviceRoleKey: envKey };
  }

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

export function createServiceClient(): SupabaseClient {
  const env = resolveSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

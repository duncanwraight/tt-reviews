import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppLoadContext } from "react-router";

export function createSupabaseClient(context: AppLoadContext): SupabaseClient {
  const env = context.cloudflare.env as Cloudflare.Env;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export function createSupabaseAdminClient(
  context: AppLoadContext
): SupabaseClient {
  const env = context.cloudflare.env as Cloudflare.Env;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

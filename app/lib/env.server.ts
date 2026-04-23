/**
 * Environment variable utilities for handling both Cloudflare Workers and standard development
 */

import type { AppLoadContext } from "react-router";

export function getEnvVar(context: AppLoadContext, key: string): string {
  if (context.cloudflare?.env) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (context.cloudflare.env as any)[key] || "";
  }

  // Fallback to process.env for vitest runs that build AppLoadContext manually.
  // In Workers (prod + dev) cloudflare.env is always populated.
  return process.env[key] || "";
}

/**
 * Return the validated Supabase config. Throws if either var is missing — we
 * used to bake in the demo anon key as a dev fallback, but that meant a
 * misconfigured prod Worker would silently point at the local demo key.
 * Fail-closed instead and surface the config gap early.
 */
export function getSupabaseConfig(context: AppLoadContext) {
  const supabaseUrl = getEnvVar(context, "SUPABASE_URL");
  const supabaseAnonKey = getEnvVar(context, "SUPABASE_ANON_KEY");

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured");
  }
  if (!supabaseAnonKey) {
    throw new Error("SUPABASE_ANON_KEY is not configured");
  }

  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
}

/**
 * Single source of truth for dev/prod detection. Reads ENVIRONMENT from the
 * Worker context (wrangler.toml [vars] and [env.dev.vars] set it). Fails
 * closed to prod (strict) when the var is missing — historically we
 * inferred dev from `!process.env.NODE_ENV`, but NODE_ENV is always
 * undefined on Workers, so prod was running with the dev-permissive CSP
 * and no HSTS. Only `ENVIRONMENT === "development"` turns on dev-mode.
 */
export function isDevelopment(context: AppLoadContext): boolean {
  return getEnvVar(context, "ENVIRONMENT") === "development";
}

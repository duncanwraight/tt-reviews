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

// Required everywhere — both dev and prod must populate these or the
// Worker can't function (auth, CSRF, base URLs).
const REQUIRED_ALWAYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SESSION_SECRET",
  "SITE_URL",
  "ENVIRONMENT",
] as const;

// Required in prod only. In dev, e2e/local can stub these as needed —
// .dev.vars.example documents which features they unlock.
const REQUIRED_PROD_ONLY = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CHANNEL_ID",
  "DISCORD_ALERTS_CHANNEL_ID",
  "DISCORD_ALLOWED_ROLES",
  "AUTO_ADMIN_EMAILS",
] as const;

// Discord secrets accidentally left as the placeholder strings from
// `.dev.vars.example` would otherwise pass a non-empty presence check.
// Screen them in prod so a forgotten `wrangler secret put` surfaces
// before users hit a moderation flow.
const DISCORD_PLACEHOLDER_VARS = [
  "DISCORD_PUBLIC_KEY",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CHANNEL_ID",
  "DISCORD_ALERTS_CHANNEL_ID",
] as const;
const PLACEHOLDER_NEEDLES = ["your_", "placeholder", "stub"];
const MIN_SESSION_SECRET_LENGTH = 16;

export type EnvValidationResult =
  | { ok: true }
  | { ok: false; problems: string[] };

export interface ValidateEnvOptions {
  /**
   * Whether to skip prod-only required vars and Discord-placeholder checks.
   * Caller should pass `import.meta.env.DEV` from the Worker entry — that's
   * baked at build time, so it's true under `react-router dev` (local + CI
   * e2e webServer) and false in the deployed prod bundle. Falls back to the
   * runtime `env.ENVIRONMENT` when unspecified, but that's unreliable under
   * Vite dev because wrangler.toml's top-level `[vars]` (ENVIRONMENT =
   * "production") wins over `.dev.vars`.
   */
  isDev?: boolean;
}

/**
 * Pure validation: takes the Worker env, returns the list of misconfigurations.
 * Used by the memoized fetch-entry guard; also unit-tested directly so each
 * rule has explicit coverage.
 */
export function validateEnv(
  env: Record<string, unknown>,
  options: ValidateEnvOptions = {}
): EnvValidationResult {
  const problems: string[] = [];
  const environment = env.ENVIRONMENT;
  const isDev = options.isDev ?? environment === "development";
  const isProd = !isDev;

  if (environment !== "development" && environment !== "production") {
    problems.push("ENVIRONMENT: must be 'development' or 'production'");
  }

  for (const name of REQUIRED_ALWAYS) {
    if (typeof env[name] !== "string" || (env[name] as string).length === 0) {
      problems.push(`${name}: missing`);
    }
  }

  if (isProd) {
    for (const name of REQUIRED_PROD_ONLY) {
      if (typeof env[name] !== "string" || (env[name] as string).length === 0) {
        problems.push(`${name}: missing`);
      }
    }
  }

  const sessionSecret = env.SESSION_SECRET;
  if (
    typeof sessionSecret === "string" &&
    sessionSecret.length > 0 &&
    sessionSecret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    problems.push(
      `SESSION_SECRET: too short (<${MIN_SESSION_SECRET_LENGTH} chars)`
    );
  }

  if (isProd) {
    for (const name of DISCORD_PLACEHOLDER_VARS) {
      const value = env[name];
      if (typeof value === "string" && value.length > 0) {
        const lower = value.toLowerCase();
        if (PLACEHOLDER_NEEDLES.some(needle => lower.includes(needle))) {
          problems.push(`${name}: placeholder value`);
        }
      }
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

let memoEnv: Record<string, unknown> | null = null;
let memoResult: EnvValidationResult | null = null;

/**
 * Memoized validation, keyed by env-object identity. Workers reuse one env
 * per isolate, so this runs once on cold start; tests pass distinct refs to
 * exercise the validator directly. Pass `isDev: import.meta.env.DEV` from
 * the Worker entry so dev-vs-prod is decided at build time, not from a
 * runtime var that Vite dev can't reliably overwrite.
 */
export function getValidatedEnv(
  env: Record<string, unknown>,
  options: ValidateEnvOptions = {}
): EnvValidationResult {
  if (memoEnv === env && memoResult) {
    return memoResult;
  }
  memoEnv = env;
  memoResult = validateEnv(env, options);
  return memoResult;
}

/** Test-only: clear the validation memo between cases. */
export function _resetEnvMemo(): void {
  memoEnv = null;
  memoResult = null;
}

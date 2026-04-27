import { describe, it, expect, beforeEach } from "vitest";
import { validateEnv, getValidatedEnv, _resetEnvMemo } from "../env.server";

const PROD_OK = {
  ENVIRONMENT: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SESSION_SECRET: "a-secret-of-at-least-sixteen-chars",
  SITE_URL: "https://tabletennis.reviews",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  DISCORD_PUBLIC_KEY: "deadbeef0123456789abcdef",
  DISCORD_BOT_TOKEN: "bot-token-with-real-looking-value",
  DISCORD_CHANNEL_ID: "123456789012345678",
  DISCORD_ALLOWED_ROLES: "role_1,role_2",
  AUTO_ADMIN_EMAILS: "admin@example.com",
};

const DEV_OK = {
  ENVIRONMENT: "development",
  SUPABASE_URL: "http://tt-reviews.local:54321",
  SUPABASE_ANON_KEY: "dev-anon-key",
  SESSION_SECRET: "dev-secret-change-in-production",
  SITE_URL: "http://tt-reviews.local:8787",
};

describe("validateEnv", () => {
  it("passes a fully populated prod env", () => {
    expect(validateEnv(PROD_OK)).toEqual({ ok: true });
  });

  it("passes a minimal dev env without prod-only secrets", () => {
    expect(validateEnv(DEV_OK)).toEqual({ ok: true });
  });

  it("rejects an unknown ENVIRONMENT value", () => {
    const result = validateEnv({ ...PROD_OK, ENVIRONMENT: "staging" });
    expect(result).toEqual({
      ok: false,
      problems: expect.arrayContaining([
        "ENVIRONMENT: must be 'development' or 'production'",
      ]),
    });
  });

  it("flags every missing always-required var", () => {
    const result = validateEnv({ ENVIRONMENT: "development" });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "SUPABASE_URL: missing",
        "SUPABASE_ANON_KEY: missing",
        "SESSION_SECRET: missing",
        "SITE_URL: missing",
      ])
    );
  });

  it("treats empty strings as missing", () => {
    const result = validateEnv({ ...DEV_OK, SUPABASE_URL: "" });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toContain("SUPABASE_URL: missing");
  });

  it("flags prod-only secrets only when ENVIRONMENT=production", () => {
    const prodMissing = { ...DEV_OK, ENVIRONMENT: "production" };
    const result = validateEnv(prodMissing);
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "SUPABASE_SERVICE_ROLE_KEY: missing",
        "DISCORD_PUBLIC_KEY: missing",
        "DISCORD_BOT_TOKEN: missing",
        "DISCORD_CHANNEL_ID: missing",
        "DISCORD_ALLOWED_ROLES: missing",
        "AUTO_ADMIN_EMAILS: missing",
      ])
    );
  });

  it("rejects a SESSION_SECRET shorter than 16 chars", () => {
    const result = validateEnv({ ...DEV_OK, SESSION_SECRET: "short" });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toContain("SESSION_SECRET: too short (<16 chars)");
  });

  it("does not double-report short SESSION_SECRET as missing", () => {
    const result = validateEnv({ ...DEV_OK, SESSION_SECRET: "short" });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).not.toContain("SESSION_SECRET: missing");
  });

  it("rejects placeholder Discord secrets in prod", () => {
    const result = validateEnv({
      ...PROD_OK,
      DISCORD_BOT_TOKEN: "your_dev_discord_bot_token",
      DISCORD_PUBLIC_KEY: "placeholder",
      DISCORD_CHANNEL_ID: "stub",
    });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "DISCORD_BOT_TOKEN: placeholder value",
        "DISCORD_PUBLIC_KEY: placeholder value",
        "DISCORD_CHANNEL_ID: placeholder value",
      ])
    );
  });

  it("ignores Discord placeholder strings in dev", () => {
    // .dev.vars.example ships these placeholders; dev shouldn't fail.
    expect(
      validateEnv({
        ...DEV_OK,
        DISCORD_BOT_TOKEN: "stub",
        DISCORD_PUBLIC_KEY: "placeholder",
        DISCORD_CHANNEL_ID: "stub",
      })
    ).toEqual({ ok: true });
  });

  it("flags an empty SESSION_SECRET as missing, not too-short", () => {
    const result = validateEnv({ ...DEV_OK, SESSION_SECRET: "" });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toContain("SESSION_SECRET: missing");
    expect(result.problems).not.toContain(
      "SESSION_SECRET: too short (<16 chars)"
    );
  });

  it("treats opts.isDev=true as dev regardless of env.ENVIRONMENT", () => {
    // react-router dev exposes the prod [vars] block where ENVIRONMENT is
    // "production"; the caller hands isDev based on import.meta.env.DEV so
    // we don't enforce prod-only rules against the e2e dev server.
    const env = {
      ...DEV_OK,
      ENVIRONMENT: "production",
      DISCORD_BOT_TOKEN: "stub",
    };
    expect(validateEnv(env, { isDev: true })).toEqual({ ok: true });
  });

  it("treats opts.isDev=false as prod regardless of env.ENVIRONMENT", () => {
    const env = { ...PROD_OK, ENVIRONMENT: "development" };
    // ENVIRONMENT itself is now wrong, but the prod-only required list
    // should fire because isDev=false.
    delete (env as Partial<typeof PROD_OK>).AUTO_ADMIN_EMAILS;
    const result = validateEnv(env, { isDev: false });
    if (result.ok) throw new Error("expected failure");
    expect(result.problems).toContain("AUTO_ADMIN_EMAILS: missing");
  });
});

describe("getValidatedEnv (memoized)", () => {
  beforeEach(() => {
    _resetEnvMemo();
  });

  it("caches by env-object identity", () => {
    const env = { ...DEV_OK };
    const a = getValidatedEnv(env);
    const b = getValidatedEnv(env);
    expect(a).toBe(b);
  });

  it("re-evaluates when a fresh env reference is passed", () => {
    const a = getValidatedEnv({ ...DEV_OK });
    const b = getValidatedEnv({ ...DEV_OK });
    expect(a).not.toBe(b);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
  });
});

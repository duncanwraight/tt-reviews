// Extended environment variable types for secrets not in wrangler.toml
// These are set via `wrangler secret put` or in Cloudflare dashboard

declare namespace Cloudflare {
  interface Env {
    // Supabase secrets
    SUPABASE_SERVICE_ROLE_KEY?: string;
    AUTO_ADMIN_EMAILS?: string;

    // CSRF signing secret. Must be set in prod via wrangler secret put.
    SESSION_SECRET?: string;

    // Discord integration
    DISCORD_PUBLIC_KEY?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_CHANNEL_ID?: string;
    DISCORD_GUILD_ID?: string;
    DISCORD_ALLOWED_ROLES?: string;

    // R2 bucket binding (alternative name)
    R2_BUCKET?: R2Bucket;

    // Note: FORM_RATE_LIMITER + DISCORD_RATE_LIMITER are declared as
    // required `RateLimit` bindings by the generated
    // `worker-configuration.d.ts` (sourced from wrangler.toml's
    // [[unsafe.bindings]]). `rateLimit()` treats them as optional at
    // runtime so tests / CI without wrangler still resolve cleanly.
  }
}

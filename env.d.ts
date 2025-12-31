// Extended environment variable types for secrets not in wrangler.toml
// These are set via `wrangler secret put` or in Cloudflare dashboard

declare namespace Cloudflare {
  interface Env {
    // Supabase secrets
    SUPABASE_SERVICE_ROLE_KEY?: string;
    AUTO_ADMIN_EMAILS?: string;

    // Discord integration
    DISCORD_PUBLIC_KEY?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_CHANNEL_ID?: string;
    DISCORD_GUILD_ID?: string;
    DISCORD_ALLOWED_ROLES?: string;

    // R2 bucket binding (alternative name)
    R2_BUCKET?: R2Bucket;
  }
}

export function validateEnvironment(env) {
    const envTyped = env;
    const supabaseUrl = envTyped.SUPABASE_URL;
    const supabaseAnonKey = envTyped.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = envTyped.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl) {
        throw new Error('Database URL configuration is required');
    }
    if (!supabaseAnonKey) {
        throw new Error('Database public key configuration is required');
    }
    if (!supabaseServiceRoleKey) {
        throw new Error('Database admin key configuration is required');
    }
    return {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
        DISCORD_WEBHOOK_URL: envTyped.DISCORD_WEBHOOK_URL,
        DISCORD_PUBLIC_KEY: envTyped.DISCORD_PUBLIC_KEY,
        DISCORD_ALLOWED_ROLES: envTyped.DISCORD_ALLOWED_ROLES,
        ADMIN_EMAILS: envTyped.ADMIN_EMAILS,
        SITE_URL: envTyped.SITE_URL,
    };
}

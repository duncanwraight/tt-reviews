export interface Environment {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    DISCORD_WEBHOOK_URL?: string;
    DISCORD_PUBLIC_KEY?: string;
    DISCORD_ALLOWED_ROLES?: string;
    ADMIN_EMAILS?: string;
    SITE_URL?: string;
}
export interface BindingsEnv {
    Bindings: Environment;
}
//# sourceMappingURL=environment.d.ts.map
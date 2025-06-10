export interface Environment {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  DISCORD_WEBHOOK_URL?: string
  ADMIN_EMAILS?: string
}

export interface BindingsEnv {
  Bindings: Environment
}

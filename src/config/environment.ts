import { Environment } from '../types/environment'

export function validateEnvironment(env: unknown): Environment {
  const envTyped = env as Record<string, string>

  const supabaseUrl = envTyped.SUPABASE_URL
  const supabaseAnonKey = envTyped.SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = envTyped.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required')
  }

  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY environment variable is required')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  }

  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  }
}

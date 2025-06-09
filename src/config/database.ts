import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Environment } from '../types/environment'

export function createSupabaseClient(env: Environment): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

export function createSupabaseAdminClient(env: Environment): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

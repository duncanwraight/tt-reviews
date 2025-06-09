import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Environment } from '../types/environment'

export function createSupabaseClient(env: Environment, accessToken?: string): SupabaseClient {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  })

  return client
}

export function createSupabaseAdminClient(env: Environment): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

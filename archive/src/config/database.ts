import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Environment } from '../types/environment'

export function createSupabaseClient(
  env: Environment,
  accessToken?: string,
  useServiceRole: boolean = false
): SupabaseClient {
  // Use service role key if requested, otherwise use anon key
  const apiKey = useServiceRole ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY

  const client = createClient(env.SUPABASE_URL, apiKey, {
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

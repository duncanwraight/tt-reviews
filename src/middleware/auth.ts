import { Context, Next } from 'hono'
import { User } from '@supabase/supabase-js'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { AuthenticationError } from '../utils/errors'

export type Variables = {
  user: User
}

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Authentication token required')
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix
  const env = validateEnvironment(c.env)
  const supabase = createSupabaseClient(env)

  // Verify the JWT token
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new AuthenticationError('Invalid or expired token')
  }

  // Add user to context for use in protected routes
  c.set('user', user)
  await next()
}

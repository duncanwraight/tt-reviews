import { Context, Next } from 'hono'
import { BindingsEnv } from '../types/environment'
import { EnhancedAuthVariables } from './auth-enhanced'
import { createClient } from '@supabase/supabase-js'
import { AuthService } from '../services/auth.service.js'
import { validateEnvironment } from '../config/environment.js'

export async function requireAdmin(
  c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>,
  next: Next
) {
  try {
    const env = validateEnvironment(c.env)
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
    const authService = new AuthService(supabase, env)

    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization header required' }, 401)
    }

    const token = authHeader.slice(7)
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    const isAdmin = authService.isAdmin(data.user)
    if (!isAdmin) {
      return c.json({ error: 'Admin access required' }, 403)
    }

    c.set('user', data.user)

    await next()
  } catch (error) {
    console.error('Admin middleware error:', error)
    return c.json({ error: 'Authentication failed' }, 500)
  }
}

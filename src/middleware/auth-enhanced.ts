import { Context, Next } from 'hono'
import { User } from '@supabase/supabase-js'
import { AuthWrapperService, AuthContext } from '../services/auth-wrapper.service'
import { validateEnvironment } from '../config/environment'

export type EnhancedAuthVariables = {
  user: User
  authService: AuthWrapperService
  authContext: AuthContext
}

/**
 * Enhanced auth middleware that provides full auth context
 * This replaces the basic requireAuth middleware for protected routes
 */
export async function enhancedAuth(c: Context<{ Variables: EnhancedAuthVariables }>, next: Next) {
  const env = validateEnvironment(c.env)
  const authService = new AuthWrapperService(env)

  // Get full auth context (user, token, authenticated supabase client, admin status)
  const authContext = await authService.getAuthContext(c)

  // Set auth data in context for use in controllers
  c.set('user', authContext.user)
  c.set('authService', authService)
  c.set('authContext', authContext)

  await next()
}

/**
 * Admin-only auth middleware
 */
export async function requireAdmin(c: Context<{ Variables: EnhancedAuthVariables }>, next: Next) {
  const env = validateEnvironment(c.env)
  const authService = new AuthWrapperService(env)

  // This will throw if user is not admin
  const authContext = await authService.requireAdmin(c)

  // Set auth data in context
  c.set('user', authContext.user)
  c.set('authService', authService)
  c.set('authContext', authContext)

  await next()
}

/**
 * Optional auth middleware - doesn't throw if no auth provided
 * Useful for endpoints that work for both authenticated and anonymous users
 */
export async function optionalAuth(
  c: Context<{ Variables: Partial<EnhancedAuthVariables> }>,
  next: Next
) {
  const env = validateEnvironment(c.env)
  const authService = new AuthWrapperService(env)

  try {
    const authHeader = c.req.header('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // User provided auth, validate it
      const authContext = await authService.getAuthContext(c)
      c.set('user', authContext.user)
      c.set('authService', authService)
      c.set('authContext', authContext)
    } else {
      // No auth provided, set auth service but no user
      c.set('authService', authService)
    }

    await next()
  } catch {
    // If auth validation fails, continue without auth
    // This allows the endpoint to handle the lack of auth gracefully
    c.set('authService', authService)
    await next()
  }
}

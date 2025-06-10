import { Context } from 'hono'
import { SupabaseClient, User } from '@supabase/supabase-js'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { AuthenticationError } from '../utils/errors'
import { Environment } from '../types/environment'

export interface AuthContext {
  user: User
  token: string
  supabase: SupabaseClient
  isAdmin: boolean
}

export class AuthWrapperService {
  private env: Environment

  constructor(env: Environment) {
    this.env = env
  }

  /**
   * Extract and validate Bearer token from Authorization header
   */
  private extractToken(authHeader: string | undefined): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authentication token required')
    }
    return authHeader.slice(7) // Remove 'Bearer ' prefix
  }

  /**
   * Create Supabase client with user's access token for RLS
   */
  private createAuthenticatedClient(token: string): SupabaseClient {
    return createSupabaseClient(this.env, token)
  }

  /**
   * Check if user is admin based on email
   */
  private isUserAdmin(user: User): boolean {
    if (!user?.email || !this.env.ADMIN_EMAILS) {
      return false
    }

    const adminEmails = this.env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase())
    return adminEmails.includes(user.email.toLowerCase())
  }

  /**
   * Validate token and get user information
   */
  private async validateTokenAndGetUser(token: string, supabase: SupabaseClient): Promise<User> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token')
    }

    return user
  }

  /**
   * Get authenticated context from HTTP request
   * This provides the user, token, authenticated Supabase client, and admin status
   */
  async getAuthContext(c: Context): Promise<AuthContext> {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization')
    const token = this.extractToken(authHeader)

    // Create authenticated Supabase client
    const supabase = this.createAuthenticatedClient(token)

    // Validate token and get user
    const user = await this.validateTokenAndGetUser(token, supabase)

    // Check admin status
    const isAdmin = this.isUserAdmin(user)

    return {
      user,
      token,
      supabase,
      isAdmin,
    }
  }

  /**
   * Get authenticated Supabase client from HTTP request
   * Convenience method when you only need the client
   */
  async getAuthenticatedClient(c: Context): Promise<SupabaseClient> {
    const { supabase } = await this.getAuthContext(c)
    return supabase
  }

  /**
   * Get user from HTTP request
   * Convenience method when you only need user info
   */
  async getUser(c: Context): Promise<User> {
    const { user } = await this.getAuthContext(c)
    return user
  }

  /**
   * Check if current user is admin
   */
  async checkIsAdmin(c: Context): Promise<boolean> {
    const { isAdmin } = await this.getAuthContext(c)
    return isAdmin
  }

  /**
   * Require admin access - throws if user is not admin
   */
  async requireAdmin(c: Context): Promise<AuthContext> {
    const authContext = await this.getAuthContext(c)

    if (!authContext.isAdmin) {
      throw new AuthenticationError('Admin access required')
    }

    return authContext
  }

  /**
   * Create server-side Supabase client (no user context)
   * Use this for operations that don't require user-specific RLS
   */
  createServerClient(): SupabaseClient {
    return createSupabaseClient(this.env)
  }

  /**
   * Create admin Supabase client with service role key
   * Use this for admin operations that bypass RLS
   */
  createAdminClient(): SupabaseClient {
    return createSupabaseClient(this.env, undefined, true) // true flag for service role
  }
}

/**
 * Factory function to create AuthWrapperService instance
 */
export function createAuthService(c: Context): AuthWrapperService {
  const env = validateEnvironment(c.env)
  return new AuthWrapperService(env)
}

/**
 * Convenience function to get auth context from request
 */
export async function getAuthContext(c: Context): Promise<AuthContext> {
  const authService = createAuthService(c)
  return authService.getAuthContext(c)
}

/**
 * Convenience function to get authenticated Supabase client from request
 */
export async function getAuthenticatedClient(c: Context): Promise<SupabaseClient> {
  const authService = createAuthService(c)
  return authService.getAuthenticatedClient(c)
}

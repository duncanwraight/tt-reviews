import { createCookieSessionStorage } from 'react-router'
import type { AppLoadContext } from 'react-router'
import { createSupabaseClient, createSupabaseAdminClient } from './database.server'
import type { User, Session } from '@supabase/supabase-js'

// Session data structure
export interface SessionData {
  access_token: string
  refresh_token?: string
  expires_at: number
  user_id: string
}

// Auth context for routes
export interface AuthContext {
  user: User
  token: string
  supabase: any
  isAdmin: boolean
}

// Create session storage with secure settings
function createSessionStorage(context: AppLoadContext) {
  const env = context.cloudflare.env as Record<string, string>
  
  return createCookieSessionStorage({
    cookie: {
      name: '__session',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
      sameSite: 'lax',
      secrets: [env.SESSION_SECRET || 'dev-secret-change-in-production'],
      secure: env.ENVIRONMENT === 'production',
    },
  })
}

export class AuthService {
  private sessionStorage: any
  private context: AppLoadContext

  constructor(context: AppLoadContext) {
    this.context = context
    this.sessionStorage = createSessionStorage(context)
  }

  // Get session from request
  async getSession(request: Request) {
    return await this.sessionStorage.getSession(request.headers.get('Cookie'))
  }

  // Commit session to response headers
  async commitSession(session: any) {
    return await this.sessionStorage.commitSession(session)
  }

  // Destroy session
  async destroySession(session: any) {
    return await this.sessionStorage.destroySession(session)
  }

  // Get user data from session
  getSessionData(session: any): SessionData | null {
    const data = session.get('sessionData')
    if (!data) return null

    // Check if session is expired
    if (data.expires_at && Date.now() > data.expires_at * 1000) {
      return null
    }

    return data
  }

  // Set session data
  setSessionData(session: any, sessionData: SessionData) {
    session.set('sessionData', sessionData)
  }

  // Get CSRF token from session
  getCSRFToken(session: any): string {
    let token = session.get('csrfToken')
    if (!token) {
      token = this.generateCSRFToken()
      session.set('csrfToken', token)
    }
    return token
  }

  // Validate CSRF token
  validateCSRFToken(session: any, providedToken?: string): boolean {
    const storedToken = session.get('csrfToken')
    if (!storedToken || !providedToken) {
      return false
    }
    return storedToken === providedToken
  }

  // Generate secure CSRF token
  private generateCSRFToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  // Check if user is admin
  private isUserAdmin(user: User): boolean {
    const env = this.context.cloudflare.env as Record<string, string>
    const adminEmails = env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || []
    return adminEmails.includes(user.email || '')
  }

  // Validate token and get user data
  private async validateTokenAndGetUser(token: string): Promise<User> {
    const supabase = createSupabaseClient(this.context)
    
    // Set the session for this client
    await supabase.auth.setSession({
      access_token: token,
      refresh_token: '', // We'll handle refresh separately
    })

    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      throw new Error('Invalid authentication token')
    }

    return user
  }

  // Get authenticated context from session
  async getAuthContext(session: any): Promise<AuthContext> {
    const sessionData = this.getSessionData(session)
    if (!sessionData) {
      throw new Error('No valid authentication found')
    }

    // Validate token and get user
    const user = await this.validateTokenAndGetUser(sessionData.access_token)

    // Create authenticated Supabase client
    const supabase = createSupabaseClient(this.context)
    await supabase.auth.setSession({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token || '',
    })

    // Check admin status
    const isAdmin = this.isUserAdmin(user)

    return {
      user,
      token: sessionData.access_token,
      supabase,
      isAdmin,
    }
  }

  // Optional auth context (doesn't throw on failure)
  async getOptionalAuthContext(session: any): Promise<AuthContext | null> {
    try {
      return await this.getAuthContext(session)
    } catch {
      return null
    }
  }

  // Sign in user
  async signIn(email: string, password: string): Promise<{
    user: User | null
    sessionData: SessionData | null
    error: Error | null
  }> {
    try {
      const supabase = createSupabaseClient(this.context)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error || !data.user || !data.session) {
        return {
          user: null,
          sessionData: null,
          error: new Error(error?.message || 'Sign in failed'),
        }
      }

      const sessionData: SessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at || 0,
        user_id: data.user.id,
      }

      return {
        user: data.user,
        sessionData,
        error: null,
      }
    } catch (error) {
      return {
        user: null,
        sessionData: null,
        error: error as Error,
      }
    }
  }

  // Sign up user
  async signUp(email: string, password: string): Promise<{
    user: User | null
    sessionData: SessionData | null
    error: Error | null
  }> {
    try {
      const supabase = createSupabaseClient(this.context)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        return {
          user: null,
          sessionData: null,
          error: new Error(error.message),
        }
      }

      // For signup, session might be null if email confirmation is required
      let sessionData: SessionData | null = null
      if (data.session) {
        sessionData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || 0,
          user_id: data.user!.id,
        }
      }

      return {
        user: data.user,
        sessionData,
        error: null,
      }
    } catch (error) {
      return {
        user: null,
        sessionData: null,
        error: error as Error,
      }
    }
  }

  // Sign out user
  async signOut(session: any): Promise<{ error: Error | null }> {
    try {
      const sessionData = this.getSessionData(session)
      if (sessionData) {
        const supabase = createSupabaseClient(this.context)
        await supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token || '',
        })
        await supabase.auth.signOut()
      }

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  // Refresh session
  async refreshSession(session: any): Promise<SessionData | null> {
    const sessionData = this.getSessionData(session)
    if (!sessionData?.refresh_token) {
      return null
    }

    try {
      const supabase = createSupabaseClient(this.context)
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: sessionData.refresh_token,
      })

      if (error || !data.session) {
        return null
      }

      const newSessionData: SessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at || 0,
        user_id: data.session.user.id,
      }

      this.setSessionData(session, newSessionData)
      return newSessionData
    } catch {
      return null
    }
  }
}
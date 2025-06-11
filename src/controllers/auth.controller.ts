import { Context } from 'hono'
import { AuthService } from '../services/auth.service'
import { createAuthService } from '../services/auth-wrapper.service'
import { CookieAuthService } from '../services/cookie-auth.service'
import { successResponse, errorResponse } from '../utils/response'
import { ValidationError } from '../utils/errors'
import { EnhancedAuthVariables } from '../middleware/auth-enhanced'
import { SecureAuthVariables } from '../middleware/auth-secure'

export class AuthController {
  static async signUp(c: Context) {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      throw new ValidationError('Email and authentication credentials are required')
    }

    const authWrapperService = createAuthService(c)
    const supabase = authWrapperService.createServerClient()
    const authService = new AuthService(supabase)

    const { user, error } = await authService.signUp(email, password)

    if (error) {
      return errorResponse(c, error.message, 400)
    }

    return successResponse(c, { user, message: 'User created successfully' })
  }

  static async signIn(c: Context) {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      throw new ValidationError('Email and authentication credentials are required')
    }

    const authWrapperService = createAuthService(c)
    const supabase = authWrapperService.createServerClient()
    const authService = new AuthService(supabase)

    const { user, session, error } = await authService.signIn(email, password)

    if (error) {
      return errorResponse(c, error.message, 400)
    }

    return successResponse(c, { user, session })
  }

  static async signOut(c: Context) {
    const authWrapperService = createAuthService(c)
    const supabase = authWrapperService.createServerClient()
    const authService = new AuthService(supabase)

    const { error } = await authService.signOut()

    if (error) {
      return errorResponse(c, error.message, 400)
    }

    return successResponse(c, { message: 'Signed out successfully' })
  }

  static async getUser(c: Context) {
    const authWrapperService = createAuthService(c)
    const supabase = authWrapperService.createServerClient()
    const authService = new AuthService(supabase)

    const { user, error } = await authService.getUser()

    if (error) {
      return errorResponse(c, error.message, 400)
    }

    return successResponse(c, { user })
  }

  static async resetPassword(c: Context) {
    const { email } = await c.req.json()

    if (!email) {
      throw new ValidationError('Email is required')
    }

    const authWrapperService = createAuthService(c)
    const supabase = authWrapperService.createServerClient()
    const authService = new AuthService(supabase)

    const { error } = await authService.resetPassword(email)

    if (error) {
      return errorResponse(c, error.message, 400)
    }

    return successResponse(c, { message: 'Password reset email sent' })
  }

  static async getProfile(c: Context<{ Variables: EnhancedAuthVariables }>) {
    const user = c.get('user')
    return successResponse(c, {
      user,
      message: 'This is a protected route - you are authenticated!',
    })
  }

  static async getMe(c: Context) {
    try {
      const authWrapperService = createAuthService(c)
      const { user, isAdmin } = await authWrapperService.getAuthContext(c)

      return successResponse(c, {
        user,
        isAdmin,
      })
    } catch (error) {
      console.error('Error in getMe:', error)
      return errorResponse(c, 'Authentication failed', 500)
    }
  }

  /**
   * Secure cookie-based sign in
   */
  static async signInSecure(c: Context<{ Variables: SecureAuthVariables }>) {
    try {
      const { email, password } = await c.req.json()

      if (!email || !password) {
        throw new ValidationError('Email and authentication credentials are required')
      }

      const authService = c.get('authService') || new CookieAuthService(c.env as any)
      const { user, session, csrfToken, error } = await authService.signInWithCookie(
        c,
        email,
        password
      )

      if (error) {
        return errorResponse(c, error.message, 400)
      }

      return successResponse(c, {
        user,
        session: {
          // Don't return sensitive token data to client
          user: session.user,
          expires_at: session.expires_at,
        },
        csrfToken,
      })
    } catch (error) {
      console.error('Secure sign in error:', error)
      return errorResponse(c, 'Sign in failed', 500)
    }
  }

  /**
   * Secure cookie-based sign out
   */
  static async signOutSecure(c: Context<{ Variables: SecureAuthVariables }>) {
    try {
      const authService = c.get('authService') || new CookieAuthService(c.env as any)
      const { error } = await authService.signOutWithCookie(c)

      if (error) {
        console.error('Sign out error:', error)
        return errorResponse(c, 'Sign out failed', 500)
      }

      return successResponse(c, { message: 'Signed out successfully' })
    } catch (error) {
      console.error('Secure sign out error:', error)
      return errorResponse(c, 'Sign out failed', 500)
    }
  }

  /**
   * Get current user info for cookie-authenticated requests
   */
  static async getMeSecure(c: Context<{ Variables: SecureAuthVariables }>) {
    try {
      const user = c.get('user')
      const authContext = c.get('authContext')
      const sessionData = c.get('sessionData')

      return successResponse(c, {
        user,
        isAdmin: authContext?.isAdmin || false,
        sessionData: sessionData
          ? {
              user_id: sessionData.user_id,
              expires_at: sessionData.expires_at,
            }
          : null,
      })
    } catch (error) {
      console.error('Error in getMeSecure:', error)
      return errorResponse(c, 'Authentication failed', 500)
    }
  }
}

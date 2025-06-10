import { Context } from 'hono'
import { AuthService } from '../services/auth.service'
import { createAuthService } from '../services/auth-wrapper.service'
import { successResponse, errorResponse } from '../utils/response'
import { ValidationError } from '../utils/errors'
import { EnhancedAuthVariables } from '../middleware/auth-enhanced'

export class AuthController {
  static async signUp(c: Context) {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      throw new ValidationError('Email and password are required')
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
      throw new ValidationError('Email and password are required')
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
}

import { Hono } from 'hono'
import { AuthController } from '../controllers/auth.controller'
import { enhancedAuth, EnhancedAuthVariables } from '../middleware/auth-enhanced'
import {
  secureAuth,
  optionalSecureAuth,
  requireCSRF,
  SecureAuthVariables,
} from '../middleware/auth-secure'

const auth = new Hono<{ Variables: EnhancedAuthVariables | SecureAuthVariables }>()

// Public authentication routes
auth.post('/signup', AuthController.signUp)
auth.post('/signin', AuthController.signIn)
auth.post('/signout', AuthController.signOut)
auth.get('/user', AuthController.getUser)
auth.get('/me', AuthController.getMe)
auth.post('/reset-password', AuthController.resetPassword)

// Protected routes (legacy Bearer token auth)
auth.get('/profile', enhancedAuth, AuthController.getProfile)

// Secure cookie-based authentication routes
auth.get('/csrf-token', optionalSecureAuth, AuthController.getCSRFToken)
auth.post('/signin-secure', optionalSecureAuth, requireCSRF, AuthController.signInSecure)
auth.post('/signout-secure', optionalSecureAuth, requireCSRF, AuthController.signOutSecure)
auth.get('/me-secure', secureAuth, AuthController.getMeSecure)

export { auth }

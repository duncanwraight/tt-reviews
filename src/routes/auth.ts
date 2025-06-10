import { Hono } from 'hono'
import { AuthController } from '../controllers/auth.controller'
import { enhancedAuth, EnhancedAuthVariables } from '../middleware/auth-enhanced'

const auth = new Hono<{ Variables: EnhancedAuthVariables }>()

// Public authentication routes
auth.post('/signup', AuthController.signUp)
auth.post('/signin', AuthController.signIn)
auth.post('/signout', AuthController.signOut)
auth.get('/user', AuthController.getUser)
auth.get('/me', AuthController.getMe)
auth.post('/reset-password', AuthController.resetPassword)

// Protected routes
auth.get('/profile', enhancedAuth, AuthController.getProfile)

export { auth }

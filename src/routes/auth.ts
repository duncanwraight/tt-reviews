import { Hono } from 'hono'
import { AuthController } from '../controllers/auth.controller'
import { requireAuth, Variables } from '../middleware/auth'

const auth = new Hono<{ Variables: Variables }>()

// Public authentication routes
auth.post('/signup', AuthController.signUp)
auth.post('/signin', AuthController.signIn)
auth.post('/signout', AuthController.signOut)
auth.get('/user', AuthController.getUser)
auth.post('/reset-password', AuthController.resetPassword)

// Protected routes
auth.get('/profile', requireAuth, AuthController.getProfile)

export { auth }

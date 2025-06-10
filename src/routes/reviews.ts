import { Hono } from 'hono'
import { ReviewsController } from '../controllers/reviews.controller.js'
import { requireAuth, Variables } from '../middleware/auth.js'
import { createSupabaseClient } from '../config/database.js'
import { validateEnvironment } from '../config/environment.js'
import { EquipmentService } from '../services/equipment.service.js'
import { createClient } from '@supabase/supabase-js'

export function createReviewsRoutes() {
  const app = new Hono<{ Variables: Variables }>()

  app.use('*', async (c, next) => {
    await next()
  })

  app.use('*', requireAuth)

  app.post('/', async c => {
    const env = validateEnvironment(c.env)
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.substring(7) // Remove 'Bearer ' prefix

    // Create client and set session for RLS
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

    if (token) {
      // Set the auth session manually for RLS
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '', // Not needed for this use case
      })
    }

    const equipmentService = new EquipmentService(supabase)
    const controller = new ReviewsController(equipmentService)
    return controller.createReview(c)
  })

  app.get('/user', async c => {
    const env = validateEnvironment(c.env)
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.substring(7)

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

    if (token) {
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      })
    }

    const equipmentService = new EquipmentService(supabase)
    const controller = new ReviewsController(equipmentService)
    return controller.getUserReviews(c)
  })

  app.get('/user/:equipmentId', async c => {
    const env = validateEnvironment(c.env)
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.substring(7)

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

    if (token) {
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      })
    }

    const equipmentService = new EquipmentService(supabase)
    const controller = new ReviewsController(equipmentService)
    return controller.getUserReview(c)
  })

  app.put('/:reviewId', async c => {
    const env = validateEnvironment(c.env)
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.substring(7)

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

    if (token) {
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      })
    }

    const equipmentService = new EquipmentService(supabase)
    const controller = new ReviewsController(equipmentService)
    return controller.updateReview(c)
  })

  app.delete('/:reviewId', async c => {
    const env = validateEnvironment(c.env)
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.substring(7)

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

    if (token) {
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      })
    }

    const equipmentService = new EquipmentService(supabase)
    const controller = new ReviewsController(equipmentService)
    return controller.deleteReview(c)
  })

  return app
}

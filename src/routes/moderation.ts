import { Hono } from 'hono'
import { BindingsEnv } from '../types/environment'
import { Variables } from '../middleware/auth'
import { ModerationController } from '../controllers/moderation.controller.js'
import { requireAdmin } from '../middleware/admin.js'

const moderation = new Hono<BindingsEnv & { Variables: Variables }>()

moderation.use('/*', requireAdmin)

moderation.get('/reviews/pending', ModerationController.getPendingReviews)
moderation.get('/reviews/:id', ModerationController.getReview)
moderation.post('/reviews/:id/approve', ModerationController.approveReview)
moderation.post('/reviews/:id/reject', ModerationController.rejectReview)
moderation.get('/stats', ModerationController.getModerationStats)

export { moderation }

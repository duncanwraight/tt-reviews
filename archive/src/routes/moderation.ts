import { Hono } from 'hono'
import { BindingsEnv } from '../types/environment'
import { EnhancedAuthVariables, requireAdmin } from '../middleware/auth-enhanced'
import { ModerationController } from '../controllers/moderation.controller.js'

const moderation = new Hono<BindingsEnv & { Variables: EnhancedAuthVariables }>()

moderation.use('/*', requireAdmin)

moderation.get('/reviews/pending', ModerationController.getPendingReviews)
moderation.get('/reviews/:id', ModerationController.getReview)
moderation.post('/reviews/:id/approve', ModerationController.approveReview)
moderation.post('/reviews/:id/reject', ModerationController.rejectReview)

moderation.get('/player-edits/pending', ModerationController.getPendingPlayerEdits)
moderation.get('/player-edits/:id', ModerationController.getPlayerEdit)
moderation.post('/player-edits/:id/approve', ModerationController.approvePlayerEdit)
moderation.post('/player-edits/:id/reject', ModerationController.rejectPlayerEdit)

moderation.get(
  '/equipment-submissions/pending',
  ModerationController.getPendingEquipmentSubmissions
)
moderation.get('/equipment-submissions/:id', ModerationController.getEquipmentSubmission)
moderation.post(
  '/equipment-submissions/:id/approve',
  ModerationController.approveEquipmentSubmission
)
moderation.post('/equipment-submissions/:id/reject', ModerationController.rejectEquipmentSubmission)

moderation.get('/stats', ModerationController.getModerationStats)

export { moderation }

import type { Context } from 'hono'
import { BindingsEnv } from '../types/environment'
import { EnhancedAuthVariables } from '../middleware/auth-enhanced'
import { ModerationService } from '../services/moderation.service.js'
import { createAuthService } from '../services/auth-wrapper.service'

export class ModerationController {
  static async getPendingReviews(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const result = await moderationService.getPendingReviews(limit, offset)

      return c.json({
        success: true,
        data: result,
      })
    } catch (error) {
      console.error('Error fetching pending reviews:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to fetch pending reviews',
        },
        500
      )
    }
  }

  static async approveReview(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const reviewId = c.req.param('id')
      const user = c.get('user')

      if (!reviewId) {
        return c.json(
          {
            success: false,
            error: 'Review ID is required',
          },
          400
        )
      }

      const result = await moderationService.approveReview(reviewId, user.id, true)

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.message,
          },
          result.status === 'error' ? 500 : 400
        )
      }

      return c.json({
        success: true,
        message: result.message,
        status: result.status,
      })
    } catch (error) {
      console.error('Error approving review:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to approve review',
        },
        500
      )
    }
  }

  static async rejectReview(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const reviewId = c.req.param('id')
      const user = c.get('user')
      const body = await c.req.json()
      const reason = body?.reason

      if (!reviewId) {
        return c.json(
          {
            success: false,
            error: 'Review ID is required',
          },
          400
        )
      }

      const success = await moderationService.rejectReview(reviewId, user.id, reason)

      if (!success) {
        return c.json(
          {
            success: false,
            error: 'Failed to reject review',
          },
          500
        )
      }

      return c.json({
        success: true,
        message: 'Review rejected successfully',
      })
    } catch (error) {
      console.error('Error rejecting review:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to reject review',
        },
        500
      )
    }
  }

  static async getReview(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const reviewId = c.req.param('id')

      if (!reviewId) {
        return c.json(
          {
            success: false,
            error: 'Review ID is required',
          },
          400
        )
      }

      const review = await moderationService.getReviewById(reviewId)

      if (!review) {
        return c.json(
          {
            success: false,
            error: 'Review not found',
          },
          404
        )
      }

      return c.json({
        success: true,
        data: review,
      })
    } catch (error) {
      console.error('Error fetching review:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to fetch review',
        },
        500
      )
    }
  }

  static async getModerationStats(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const stats = await moderationService.getModerationStats()

      return c.json({
        success: true,
        data: stats,
      })
    } catch (error) {
      console.error('Error fetching moderation stats:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to fetch moderation stats',
        },
        500
      )
    }
  }

  static async getPendingPlayerEdits(
    c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>
  ) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const result = await moderationService.getPendingPlayerEdits(limit, offset)

      return c.json({
        success: true,
        data: result,
      })
    } catch (error) {
      console.error('Error fetching pending player edits:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to fetch pending player edits',
        },
        500
      )
    }
  }

  static async approvePlayerEdit(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const editId = c.req.param('id')
      const user = c.get('user')

      if (!editId) {
        return c.json(
          {
            success: false,
            error: 'Player edit ID is required',
          },
          400
        )
      }

      const result = await moderationService.approvePlayerEdit(editId, user.id)

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.message,
          },
          result.status === 'error' ? 500 : 400
        )
      }

      return c.json({
        success: true,
        message: result.message,
        status: result.status,
      })
    } catch (error) {
      console.error('Error approving player edit:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to approve player edit',
        },
        500
      )
    }
  }

  static async rejectPlayerEdit(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const editId = c.req.param('id')
      const user = c.get('user')
      const body = await c.req.json()
      const reason = body?.reason

      if (!editId) {
        return c.json(
          {
            success: false,
            error: 'Player edit ID is required',
          },
          400
        )
      }

      const success = await moderationService.rejectPlayerEdit(editId, user.id, reason)

      if (!success) {
        return c.json(
          {
            success: false,
            error: 'Failed to reject player edit',
          },
          500
        )
      }

      return c.json({
        success: true,
        message: 'Player edit rejected successfully',
      })
    } catch (error) {
      console.error('Error rejecting player edit:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to reject player edit',
        },
        500
      )
    }
  }

  static async getPlayerEdit(c: Context<BindingsEnv & { Variables: EnhancedAuthVariables }>) {
    try {
      const authService = createAuthService(c)
      const supabase = authService.createAdminClient()
      const moderationService = new ModerationService(supabase)

      const editId = c.req.param('id')

      if (!editId) {
        return c.json(
          {
            success: false,
            error: 'Player edit ID is required',
          },
          400
        )
      }

      const edit = await moderationService.getPlayerEditById(editId)

      if (!edit) {
        return c.json(
          {
            success: false,
            error: 'Player edit not found',
          },
          404
        )
      }

      return c.json({
        success: true,
        data: edit,
      })
    } catch (error) {
      console.error('Error fetching player edit:', error)
      return c.json(
        {
          success: false,
          error: 'Failed to fetch player edit',
        },
        500
      )
    }
  }
}

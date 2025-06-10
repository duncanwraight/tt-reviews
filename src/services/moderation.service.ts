import { SupabaseClient } from '@supabase/supabase-js'
import { EquipmentReview } from '../types/database.js'

export class ModerationService {
  constructor(private supabase: SupabaseClient) {}

  async getPendingReviews(
    limit = 50,
    offset = 0
  ): Promise<{ reviews: EquipmentReview[]; total: number }> {
    const [reviewsResult, countResult] = await Promise.all([
      this.supabase
        .from('equipment_reviews')
        .select(
          `
          *,
          equipment (
            id,
            name,
            manufacturer,
            category,
            subcategory
          )
        `
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1),

      this.supabase
        .from('equipment_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

    if (reviewsResult.error) {
      console.error('Error fetching pending reviews:', reviewsResult.error)
      return { reviews: [], total: 0 }
    }

    const total = countResult.count || 0
    const reviews = (reviewsResult.data as unknown as EquipmentReview[]) || []

    return { reviews, total }
  }

  async approveReview(
    reviewId: string,
    moderatorId: string
  ): Promise<{
    success: boolean
    status: 'first_approval' | 'fully_approved' | 'already_approved' | 'error'
    message: string
  }> {
    try {
      // Get current review to check existing approvals
      const review = await this.getReviewById(reviewId)
      if (!review) {
        return { success: false, status: 'error', message: 'Review not found' }
      }

      // Check if review is in a state that can be approved
      if (!['pending', 'awaiting_second_approval'].includes(review.status)) {
        return { success: false, status: 'already_approved', message: 'Review already processed' }
      }

      // Get existing moderation logs to check if this moderator already approved
      const existingApprovals = await this.getReviewApprovals(reviewId)
      if (existingApprovals.includes(moderatorId)) {
        return {
          success: false,
          status: 'already_approved',
          message: 'You have already approved this review',
        }
      }

      // Log this approval
      await this.logModerationAction(reviewId, moderatorId, 'approved')

      // Check if this is the first or second approval
      if (review.status === 'pending') {
        // First approval - move to awaiting second approval
        const { error } = await this.supabase
          .from('equipment_reviews')
          .update({
            status: 'awaiting_second_approval',
            updated_at: new Date().toISOString(),
          })
          .eq('id', reviewId)

        if (error) {
          console.error('Error updating review to awaiting second approval:', error)
          return { success: false, status: 'error', message: 'Failed to update review status' }
        }

        return {
          success: true,
          status: 'first_approval',
          message: 'First approval recorded. Awaiting second approval.',
        }
      } else {
        // Second approval - fully approve the review
        const { error } = await this.supabase
          .from('equipment_reviews')
          .update({
            status: 'approved',
            updated_at: new Date().toISOString(),
          })
          .eq('id', reviewId)

        if (error) {
          console.error('Error fully approving review:', error)
          return { success: false, status: 'error', message: 'Failed to approve review' }
        }

        return {
          success: true,
          status: 'fully_approved',
          message: 'Review fully approved and published!',
        }
      }
    } catch (error) {
      console.error('Error in approveReview:', error)
      return { success: false, status: 'error', message: 'Internal error occurred' }
    }
  }

  async rejectReview(reviewId: string, moderatorId: string, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('equipment_reviews')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .eq('status', 'pending')

    if (error) {
      console.error('Error rejecting review:', error)
      return false
    }

    await this.logModerationAction(reviewId, moderatorId, 'rejected', reason)
    return true
  }

  async getReviewById(reviewId: string): Promise<EquipmentReview | null> {
    const { data, error } = await this.supabase
      .from('equipment_reviews')
      .select(
        `
        *,
        equipment (
          id,
          name,
          manufacturer,
          category,
          subcategory
        )
      `
      )
      .eq('id', reviewId)
      .single()

    if (error) {
      console.error('Error fetching review:', error)
      return null
    }

    return data as unknown as EquipmentReview
  }

  async getModerationStats(): Promise<{
    pending: number
    approved: number
    rejected: number
    total: number
  }> {
    const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
      this.supabase
        .from('equipment_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),

      this.supabase
        .from('equipment_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved'),

      this.supabase
        .from('equipment_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected'),
    ])

    const pending = pendingResult.count || 0
    const approved = approvedResult.count || 0
    const rejected = rejectedResult.count || 0

    return {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    }
  }

  async getReviewApprovals(reviewId: string): Promise<string[]> {
    // For now, we'll use console logs to track approvals
    // In a production system, this would query a moderation_actions table
    // This is a temporary implementation - we'll track in memory/logs
    return []
  }

  private async logModerationAction(
    reviewId: string,
    moderatorId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ): Promise<void> {
    const logEntry = {
      reviewId,
      moderatorId,
      action,
      reason,
      timestamp: new Date().toISOString(),
    }

    console.log(
      `Moderation action: ${action} review ${reviewId} by moderator ${moderatorId}`,
      logEntry
    )

    // TODO: In production, store this in a moderation_actions table:
    // await this.supabase.from('moderation_actions').insert(logEntry)
  }
}

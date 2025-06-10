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

  async approveReview(reviewId: string, moderatorId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('equipment_reviews')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .eq('status', 'pending')

    if (error) {
      console.error('Error approving review:', error)
      return false
    }

    await this.logModerationAction(reviewId, moderatorId, 'approved')
    return true
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

  private async logModerationAction(
    reviewId: string,
    moderatorId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ): Promise<void> {
    console.log(`Moderation action: ${action} review ${reviewId} by moderator ${moderatorId}`, {
      reviewId,
      moderatorId,
      action,
      reason,
      timestamp: new Date().toISOString(),
    })
  }
}

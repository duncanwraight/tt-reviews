import { SupabaseClient } from '@supabase/supabase-js'
import { EquipmentReview, PlayerEdit } from '../types/database.js'

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
    moderatorId: string,
    isAdminApproval = false
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
      await this.logModerationAction(reviewId, moderatorId, 'approved', undefined, 'review')

      // Admin approvals bypass the two-approval system
      if (isAdminApproval) {
        const { error } = await this.supabase
          .from('equipment_reviews')
          .update({
            status: 'approved',
            updated_at: new Date().toISOString(),
          })
          .eq('id', reviewId)

        if (error) {
          console.error('Error approving review (admin):', error)
          return { success: false, status: 'error', message: 'Failed to approve review' }
        }

        return {
          success: true,
          status: 'fully_approved',
          message: 'Review approved and published!',
        }
      }

      // Discord approvals use the two-approval system
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

    await this.logModerationAction(reviewId, moderatorId, 'rejected', reason, 'review')
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
    playerEditsPending: number
    playerEditsApproved: number
    playerEditsRejected: number
    playerEditsTotal: number
  }> {
    const [
      pendingResult,
      approvedResult,
      rejectedResult,
      playerPendingResult,
      playerApprovedResult,
      playerRejectedResult,
    ] = await Promise.all([
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

      this.supabase
        .from('player_edits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),

      this.supabase
        .from('player_edits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved'),

      this.supabase
        .from('player_edits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected'),
    ])

    const pending = pendingResult.count || 0
    const approved = approvedResult.count || 0
    const rejected = rejectedResult.count || 0
    const playerEditsPending = playerPendingResult.count || 0
    const playerEditsApproved = playerApprovedResult.count || 0
    const playerEditsRejected = playerRejectedResult.count || 0

    return {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
      playerEditsPending,
      playerEditsApproved,
      playerEditsRejected,
      playerEditsTotal: playerEditsPending + playerEditsApproved + playerEditsRejected,
    }
  }

  async getPendingPlayerEdits(
    limit = 50,
    offset = 0
  ): Promise<{ playerEdits: PlayerEdit[]; total: number }> {
    const [editsResult, countResult] = await Promise.all([
      this.supabase
        .from('player_edits')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1),

      this.supabase
        .from('player_edits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

    if (editsResult.error) {
      console.error('Error fetching pending player edits:', editsResult.error)
      return { playerEdits: [], total: 0 }
    }

    const total = countResult.count || 0
    const edits = editsResult.data || []

    // Fetch player data for each edit
    const playerEdits: PlayerEdit[] = []
    for (const edit of edits) {
      const { data: playerData, error: playerError } = await this.supabase
        .from('players')
        .select('id, name, slug, highest_rating, active_years, active')
        .eq('id', edit.player_id)
        .single()

      if (playerError) {
        console.error('Error fetching player for edit:', playerError)
        // Still include the edit but without player data
        playerEdits.push(edit as PlayerEdit)
      } else {
        playerEdits.push({
          ...edit,
          players: playerData,
        } as PlayerEdit)
      }
    }

    return { playerEdits, total }
  }

  async approvePlayerEdit(
    editId: string,
    moderatorId: string
  ): Promise<{
    success: boolean
    status: 'approved' | 'already_approved' | 'error'
    message: string
  }> {
    try {
      // Get current player edit to check status
      const edit = await this.getPlayerEditById(editId)
      if (!edit) {
        return { success: false, status: 'error', message: 'Player edit not found' }
      }

      // Check if edit is in a state that can be approved
      if (edit.status !== 'pending') {
        return {
          success: false,
          status: 'already_approved',
          message: 'Player edit already processed',
        }
      }

      // Admin approval is direct - no two-approval process for player edits
      // Apply the changes to the player
      const { error: updateError } = await this.supabase
        .from('players')
        .update({
          ...edit.edit_data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', edit.player_id)

      if (updateError) {
        console.error('Error applying player edit changes:', updateError)
        return { success: false, status: 'error', message: 'Failed to apply changes to player' }
      }

      // Mark the edit as approved
      const { error } = await this.supabase
        .from('player_edits')
        .update({
          status: 'approved',
          moderator_id: moderatorId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editId)

      if (error) {
        console.error('Error approving player edit:', error)
        return { success: false, status: 'error', message: 'Failed to update edit status' }
      }

      await this.logModerationAction(editId, moderatorId, 'approved', undefined, 'player_edit')

      return {
        success: true,
        status: 'approved',
        message: 'Player edit approved and changes applied!',
      }
    } catch (error) {
      console.error('Error in approvePlayerEdit:', error)
      return { success: false, status: 'error', message: 'Internal error occurred' }
    }
  }

  async rejectPlayerEdit(editId: string, moderatorId: string, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('player_edits')
      .update({
        status: 'rejected',
        moderator_id: moderatorId,
        moderator_notes: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editId)
      .eq('status', 'pending')

    if (error) {
      console.error('Error rejecting player edit:', error)
      return false
    }

    await this.logModerationAction(editId, moderatorId, 'rejected', reason, 'player_edit')
    return true
  }

  async getPlayerEditById(editId: string): Promise<PlayerEdit | null> {
    // Get the player edit first
    const { data: editData, error: editError } = await this.supabase
      .from('player_edits')
      .select('*')
      .eq('id', editId)
      .single()

    if (editError) {
      console.error('Error fetching player edit:', editError)
      return null
    }

    // Get the associated player separately
    const { data: playerData, error: playerError } = await this.supabase
      .from('players')
      .select('id, name, slug, highest_rating, active_years, active')
      .eq('id', editData.player_id)
      .single()

    if (playerError) {
      console.error('Error fetching player:', playerError)
      return null
    }

    // Combine the data
    return {
      ...editData,
      players: playerData,
    } as PlayerEdit
  }

  async getReviewApprovals(reviewId: string): Promise<string[]> {
    // For now, we'll use console logs to track approvals
    // In a production system, this would query a moderation_actions table
    // This is a temporary implementation - we'll track in memory/logs
    return []
  }

  private async logModerationAction(
    itemId: string,
    moderatorId: string,
    action: 'approved' | 'rejected',
    reason?: string,
    itemType: 'review' | 'player_edit' = 'review'
  ): Promise<void> {
    const logEntry = {
      itemId,
      moderatorId,
      action,
      reason,
      itemType,
      timestamp: new Date().toISOString(),
    }

    console.log(
      `Moderation action: ${action} ${itemType} ${itemId} by moderator ${moderatorId}`,
      logEntry
    )

    // TODO: In production, store this in a moderation_actions table:
    // await this.supabase.from('moderation_actions').insert(logEntry)
  }
}

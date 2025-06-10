import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModerationService } from './moderation.service'

describe('ModerationService', () => {
  let moderationService: ModerationService
  let mockSupabase: any

  beforeEach(() => {
    // Create a proper Supabase client mock with chainable methods
    const createChainableMock = () => ({
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    })

    mockSupabase = createChainableMock()

    moderationService = new ModerationService(mockSupabase)
    vi.clearAllMocks()
  })

  describe('approveReview', () => {
    it('should handle first approval correctly', async () => {
      // Mock getReviewById chain
      const mockReviewChain = {
        ...mockSupabase,
        single: vi
          .fn()
          .mockResolvedValue({ data: { id: 'review-123', status: 'pending' }, error: null }),
      }
      mockSupabase.from.mockReturnValue(mockReviewChain)
      mockReviewChain.select.mockReturnValue(mockReviewChain)
      mockReviewChain.eq.mockReturnValue(mockReviewChain)

      // Mock getReviewApprovals to return empty array (no prior approvals)
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue([])

      // Mock logModerationAction
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock update chain
      const mockUpdateChain = {
        ...mockSupabase,
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      mockSupabase.update.mockReturnValue(mockUpdateChain)

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(true)
      expect(result.status).toBe('first_approval')
      expect(result.message).toBe('First approval recorded. Awaiting second approval.')
    })

    it('should handle second approval correctly', async () => {
      // Mock getReviewById to return review awaiting second approval
      const mockReview = { id: 'review-123', status: 'awaiting_second_approval' }
      mockSupabase.single.mockResolvedValueOnce({ data: mockReview, error: null })

      // Mock getReviewApprovals to return different moderator
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue(['moderator-1'])

      // Mock logModerationAction
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock update to approved
      mockSupabase.eq.mockResolvedValueOnce({ error: null })

      const result = await moderationService.approveReview('review-123', 'moderator-2')

      expect(result.success).toBe(true)
      expect(result.status).toBe('fully_approved')
      expect(result.message).toBe('Review fully approved and published!')
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'approved',
        updated_at: expect.any(String),
      })
    })

    it('should prevent same moderator from approving twice', async () => {
      // Mock getReviewById to return pending review
      const mockReview = { id: 'review-123', status: 'pending' }
      mockSupabase.single.mockResolvedValueOnce({ data: mockReview, error: null })

      // Mock getReviewApprovals to return same moderator
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue(['moderator-1'])

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('already_approved')
      expect(result.message).toBe('You have already approved this review')
    })

    it('should handle review not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: 'Not found' })

      const result = await moderationService.approveReview('nonexistent', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Review not found')
    })

    it('should handle already processed review', async () => {
      const mockReview = { id: 'review-123', status: 'approved' }
      mockSupabase.single.mockResolvedValueOnce({ data: mockReview, error: null })

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('already_approved')
      expect(result.message).toBe('Review already processed')
    })

    it('should handle database update errors', async () => {
      const mockReview = { id: 'review-123', status: 'pending' }
      mockSupabase.single.mockResolvedValueOnce({ data: mockReview, error: null })
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue([])
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock database error
      mockSupabase.eq.mockResolvedValueOnce({ error: 'Database error' })

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Failed to update review status')
    })

    it('should handle unexpected errors', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Unexpected error'))

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Internal error occurred')
    })
  })

  describe('rejectReview', () => {
    it('should reject review successfully', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ error: null })
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      const result = await moderationService.rejectReview(
        'review-123',
        'moderator-1',
        'Inappropriate content'
      )

      expect(result).toBe(true)
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'rejected',
        updated_at: expect.any(String),
      })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'review-123')
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'pending')
    })

    it('should handle rejection errors', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ error: 'Database error' })

      const result = await moderationService.rejectReview('review-123', 'moderator-1')

      expect(result).toBe(false)
    })
  })

  describe('getPendingReviews', () => {
    it('should fetch pending reviews correctly', async () => {
      const mockReviews = [
        { id: 'review-1', status: 'pending' },
        { id: 'review-2', status: 'awaiting_second_approval' },
      ]

      // Mock the reviews query
      mockSupabase.range.mockResolvedValueOnce({ data: mockReviews, error: null })

      // Mock the count query
      mockSupabase.eq.mockResolvedValueOnce({ count: 2 })

      const result = await moderationService.getPendingReviews(10, 0)

      expect(result.reviews).toEqual(mockReviews)
      expect(result.total).toBe(2)
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'pending')
    })

    it('should handle query errors', async () => {
      mockSupabase.range.mockResolvedValueOnce({ data: null, error: 'Query error' })
      mockSupabase.eq.mockResolvedValueOnce({ count: 0 })

      const result = await moderationService.getPendingReviews()

      expect(result.reviews).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('getModerationStats', () => {
    it('should return correct moderation statistics', async () => {
      // Mock count queries
      mockSupabase.eq
        .mockResolvedValueOnce({ count: 5 }) // pending
        .mockResolvedValueOnce({ count: 20 }) // approved
        .mockResolvedValueOnce({ count: 3 }) // rejected

      const stats = await moderationService.getModerationStats()

      expect(stats).toEqual({
        pending: 5,
        approved: 20,
        rejected: 3,
        total: 28,
      })
    })

    it('should handle null counts', async () => {
      mockSupabase.eq
        .mockResolvedValueOnce({ count: null })
        .mockResolvedValueOnce({ count: null })
        .mockResolvedValueOnce({ count: null })

      const stats = await moderationService.getModerationStats()

      expect(stats).toEqual({
        pending: 0,
        approved: 0,
        rejected: 0,
        total: 0,
      })
    })
  })

  describe('getReviewById', () => {
    it('should fetch review by ID', async () => {
      const mockReview = { id: 'review-123', status: 'pending' }
      mockSupabase.single.mockResolvedValueOnce({ data: mockReview, error: null })

      const result = await moderationService.getReviewById('review-123')

      expect(result).toEqual(mockReview)
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'review-123')
    })

    it('should return null for non-existent review', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: 'Not found' })

      const result = await moderationService.getReviewById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getReviewApprovals', () => {
    it('should return empty array (temporary implementation)', async () => {
      const result = await moderationService.getReviewApprovals('review-123')

      expect(result).toEqual([])
    })
  })
})

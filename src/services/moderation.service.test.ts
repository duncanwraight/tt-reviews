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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    mockSupabase = createChainableMock()

    moderationService = new ModerationService(mockSupabase)
    vi.clearAllMocks()
  })

  describe('approveReview', () => {
    it('should handle first approval correctly', async () => {
      // Mock getReviewById to return a pending review
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue({
        id: 'review-123',
        status: 'pending',
      } as any)

      // Mock getReviewApprovals to return empty array (no prior approvals)
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue([])

      // Mock logModerationAction
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock update chain to succeed
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(true)
      expect(result.status).toBe('first_approval')
      expect(result.message).toBe('First approval recorded. Awaiting second approval.')
    })

    it('should handle second approval correctly', async () => {
      // Mock getReviewById to return review awaiting second approval
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue({
        id: 'review-123',
        status: 'awaiting_second_approval',
      } as any)

      // Mock getReviewApprovals to return different moderator
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue(['moderator-1'])

      // Mock logModerationAction
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock update to approved
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

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
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue({
        id: 'review-123',
        status: 'pending',
      } as any)

      // Mock getReviewApprovals to return same moderator
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue(['moderator-1'])

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('already_approved')
      expect(result.message).toBe('You have already approved this review')
    })

    it('should handle review not found', async () => {
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue(null)

      const result = await moderationService.approveReview('nonexistent', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Review not found')
    })

    it('should handle already processed review', async () => {
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue({
        id: 'review-123',
        status: 'approved',
      } as any)

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('already_approved')
      expect(result.message).toBe('Review already processed')
    })

    it('should handle database update errors', async () => {
      vi.spyOn(moderationService, 'getReviewById').mockResolvedValue({
        id: 'review-123',
        status: 'pending',
      } as any)
      vi.spyOn(moderationService, 'getReviewApprovals').mockResolvedValue([])
      vi.spyOn(moderationService as any, 'logModerationAction').mockResolvedValue(undefined)

      // Mock database error for update chain
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: 'Database error' }),
      })

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Failed to update review status')
    })

    it('should handle unexpected errors', async () => {
      vi.spyOn(moderationService, 'getReviewById').mockRejectedValue(new Error('Unexpected error'))

      const result = await moderationService.approveReview('review-123', 'moderator-1')

      expect(result.success).toBe(false)
      expect(result.status).toBe('error')
      expect(result.message).toBe('Internal error occurred')
    })
  })

  describe('rejectReview', () => {
    it('should reject review successfully', async () => {
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })
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
    })

    it('should handle rejection errors', async () => {
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: 'Database error' }),
        }),
      })

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

      // Mock the first query chain (reviews)
      const reviewsChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: mockReviews, error: null }),
            }),
          }),
        }),
      }

      // Mock the second query chain (count)
      const countChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
        }),
      }

      // Set up from to return different chains for each call
      mockSupabase.from.mockReturnValueOnce(reviewsChain).mockReturnValueOnce(countChain)

      const result = await moderationService.getPendingReviews(10, 0)

      expect(result.reviews).toEqual(mockReviews)
      expect(result.total).toBe(2)
    })

    it('should handle query errors', async () => {
      // Mock the first query chain (reviews) - with error
      const reviewsChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: null, error: 'Query error' }),
            }),
          }),
        }),
      }

      // Mock the second query chain (count)
      const countChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      }

      mockSupabase.from.mockReturnValueOnce(reviewsChain).mockReturnValueOnce(countChain)

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
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockReview, error: null }),
          }),
        }),
      })

      const result = await moderationService.getReviewById('review-123')

      expect(result).toEqual(mockReview)
    })

    it('should return null for non-existent review', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: 'Not found' }),
          }),
        }),
      })

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

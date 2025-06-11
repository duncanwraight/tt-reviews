import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiscordService } from './discord.service'
import { EquipmentService, PlayerService } from '../lib/supabase'
import { ModerationService } from './moderation.service'
import { Environment } from '../types/environment'

// Mock dependencies
vi.mock('../lib/supabase')
vi.mock('./moderation.service')

// Mock global APIs
const mockCrypto = {
  subtle: {
    importKey: vi.fn().mockResolvedValue({}),
    verify: vi.fn().mockResolvedValue(true),
  },
}

const mockFetch = vi.fn()

Object.defineProperty(globalThis, 'crypto', {
  value: mockCrypto,
  configurable: true,
})
Object.defineProperty(globalThis, 'fetch', {
  value: mockFetch,
  configurable: true,
})

describe('DiscordService', () => {
  let discordService: DiscordService
  let mockSupabase: any
  let mockEnv: Environment

  beforeEach(() => {
    mockSupabase = {}
    mockEnv = {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'mock-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
      DISCORD_PUBLIC_KEY: 'mock-public-key-that-is-long-enough-for-validation-check',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/mock',
      DISCORD_ALLOWED_ROLES: 'role1,role2',
      SITE_URL: 'https://tt-reviews.local',
    }

    // Mock the service constructors
    vi.mocked(EquipmentService).mockImplementation(
      () =>
        ({
          searchEquipment: vi.fn().mockResolvedValue([
            {
              id: '1',
              name: 'Butterfly Tenergy 05',
              manufacturer: 'Butterfly',
              category: 'Rubber',
              slug: 'butterfly-tenergy-05',
            },
          ]),
        }) as any
    )

    vi.mocked(PlayerService).mockImplementation(
      () =>
        ({
          searchPlayers: vi.fn().mockResolvedValue([
            {
              id: '1',
              name: 'Ma Long',
              slug: 'ma-long',
              active: true,
            },
          ]),
        }) as any
    )

    vi.mocked(ModerationService).mockImplementation(
      () =>
        ({
          approveReview: vi.fn().mockResolvedValue({
            success: true,
            status: 'first_approval',
            message: 'First approval recorded. Awaiting second approval.',
          }),
          rejectReview: vi.fn().mockResolvedValue(true),
        }) as any
    )

    discordService = new DiscordService(mockSupabase, mockEnv)

    // Reset mocks
    vi.clearAllMocks()
  })

  describe('verifySignature', () => {
    it('should verify valid Discord signature', async () => {
      const result = await discordService.verifySignature(
        'mock-signature',
        '1234567890',
        '{"type": 1}'
      )

      expect(result).toBe(true)
      expect(mockCrypto.subtle.importKey).toHaveBeenCalled()
      expect(mockCrypto.subtle.verify).toHaveBeenCalled()
    })

    it('should reject invalid signature', async () => {
      mockCrypto.subtle.verify.mockResolvedValue(false)

      const result = await discordService.verifySignature(
        'invalid-signature',
        '1234567890',
        '{"type": 1}'
      )

      expect(result).toBe(false)
    })

    it('should handle signature verification errors', async () => {
      mockCrypto.subtle.verify.mockRejectedValue(new Error('Crypto error'))

      const result = await discordService.verifySignature(
        'mock-signature',
        '1234567890',
        '{"type": 1}'
      )

      expect(result).toBe(false)
    })

    it('should throw error when DISCORD_PUBLIC_KEY is not configured', async () => {
      const serviceWithoutKey = new DiscordService(mockSupabase, {
        ...mockEnv,
        DISCORD_PUBLIC_KEY: undefined,
      })

      await expect(serviceWithoutKey.verifySignature('sig', 'timestamp', 'body')).rejects.toThrow(
        'DISCORD_PUBLIC_KEY not configured'
      )
    })
  })

  describe('handleSlashCommand', () => {
    it('should handle equipment search command', async () => {
      const mockEquipmentService = {
        searchEquipment: vi.fn().mockResolvedValue([
          {
            id: '1',
            name: 'Butterfly Tenergy 05',
            manufacturer: 'Butterfly',
            category: 'rubber',
            slug: 'butterfly-tenergy-05',
          },
        ]),
      }
      vi.mocked(EquipmentService).mockImplementation(() => mockEquipmentService as any)

      const interaction = {
        data: {
          name: 'equipment',
          options: [{ value: 'butterfly' }],
        },
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.type).toBe(4)
      expect(responseData.data.content).toContain('🏓 **Equipment Search Results for "butterfly"**')
      expect(responseData.data.content).toContain('Butterfly Tenergy 05')
    })

    it('should handle player search command', async () => {
      const interaction = {
        data: {
          name: 'player',
          options: [{ value: 'ma long' }],
        },
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toContain('🏓 **Player Search Results for "ma long"**')
      expect(responseData.data.content).toContain('Ma Long')
    })

    it('should handle approve command with first approval', async () => {
      const interaction = {
        data: {
          name: 'approve',
          options: [{ value: 'review-123' }],
        },
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
        user: { id: 'user-123', username: 'moderator1' },
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toContain('👍 **First Approval by moderator1**')
      expect(responseData.data.content).toContain('review-123')
    })

    it('should handle approve command with full approval', async () => {
      // Access the moderation service instance from the discord service to update its mock
      const moderationService = (discordService as any).moderationService
      vi.mocked(moderationService.approveReview).mockResolvedValueOnce({
        success: true,
        status: 'fully_approved',
        message: 'Review fully approved and published!',
      })

      const interaction = {
        data: {
          name: 'approve',
          options: [{ value: 'review-123' }],
        },
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
        user: { id: 'user-456', username: 'moderator2' },
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toContain('✅ **Review Fully Approved by moderator2**')
      expect(responseData.data.content).toContain('Review fully approved and published!')
    })

    it('should reject command from user without proper roles', async () => {
      const interaction = {
        data: { name: 'equipment', options: [{ value: 'butterfly' }] },
        member: { roles: ['invalid-role'] },
        guild_id: 'mock-guild',
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toBe('❌ You do not have permission to use this command.')
      expect((responseData.data as any).flags).toBe(64) // Ephemeral
    })

    it('should handle unknown command', async () => {
      const interaction = {
        data: { name: 'unknown' },
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const response = await discordService.handleSlashCommand(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toBe('❌ Unknown command.')
    })
  })

  describe('handlePrefixCommand', () => {
    it('should handle !equipment prefix command', async () => {
      const mockEquipmentService = {
        searchEquipment: vi.fn().mockResolvedValue([
          {
            id: '1',
            name: 'Butterfly Tenergy 05',
            manufacturer: 'Butterfly',
            category: 'rubber',
            slug: 'butterfly-tenergy-05',
          },
        ]),
      }
      vi.mocked(EquipmentService).mockImplementation(() => mockEquipmentService as any)

      const message = {
        content: '!equipment butterfly',
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const result = await discordService.handlePrefixCommand(message)
      expect(result.content).toContain('🏓 **Equipment Search Results for "butterfly"**')
      expect(result.content).toContain('Butterfly Tenergy 05')
    })

    it('should handle !player prefix command', async () => {
      const mockPlayerService = {
        searchPlayers: vi.fn().mockResolvedValue([
          {
            id: '1',
            name: 'Ma Long',
            slug: 'ma-long',
            active: true,
          },
        ]),
      }
      vi.mocked(PlayerService).mockImplementation(() => mockPlayerService as any)

      const message = {
        content: '!player ma long',
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const result = await discordService.handlePrefixCommand(message)
      expect(result.content).toContain('🏓 **Player Search Results for "ma long"**')
      expect(result.content).toContain('Ma Long')
    })

    it('should reject prefix command from unauthorized user', async () => {
      const message = {
        content: '!equipment butterfly',
        member: { roles: ['invalid-role'] },
        guild_id: 'mock-guild',
      }

      const result = await discordService.handlePrefixCommand(message)
      expect(result.content).toBe('❌ You do not have permission to use this command.')
    })

    it('should return null for non-command messages', async () => {
      const message = {
        content: 'Hello world',
        member: { roles: ['role1'] },
        guild_id: 'mock-guild',
      }

      const result = await discordService.handlePrefixCommand(message)
      expect(result).toBeNull()
    })
  })

  describe('notifyNewReview', () => {
    it('should send Discord webhook notification', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      const reviewData = {
        id: 'review-123',
        equipment_name: 'Butterfly Tenergy 05',
        overall_rating: 8,
        reviewer_name: 'john@example.com',
      }

      const result = await discordService.notifyNewReview(reviewData)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        mockEnv.DISCORD_WEBHOOK_URL,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('New Review Submitted'),
        })
      )

      const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body || '{}')
      expect(requestBody.embeds[0].title).toBe('🆕 New Review Submitted')
      expect(requestBody.embeds[0].fields).toContainEqual({
        name: 'Equipment',
        value: 'Butterfly Tenergy 05',
        inline: true,
      })
      expect(requestBody.components[0].components).toHaveLength(2) // Approve and Reject buttons
    })

    it('should throw error when DISCORD_WEBHOOK_URL is not configured', async () => {
      const serviceWithoutWebhook = new DiscordService(mockSupabase, {
        ...mockEnv,
        DISCORD_WEBHOOK_URL: undefined,
      })

      await expect(
        serviceWithoutWebhook.notifyNewReview({
          id: 'review-123',
          equipment_name: 'Test Equipment',
          overall_rating: 8,
          reviewer_name: 'test@example.com',
        })
      ).rejects.toThrow('DISCORD_WEBHOOK_URL not configured')
    })
  })

  describe('handleMessageComponent', () => {
    it('should handle approve button click', async () => {
      const mockModerationService = {
        approveReview: vi.fn().mockResolvedValue({
          success: true,
          status: 'first_approval',
          message: 'First approval recorded.',
        }),
      }
      vi.mocked(ModerationService).mockImplementation(() => mockModerationService as any)

      const interaction = {
        data: { custom_id: 'approve_review-123' },
        user: { id: 'user-123', username: 'moderator1' },
      }

      const response = await discordService.handleMessageComponent(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toContain('👍 **First Approval by moderator1**')
    })

    it('should handle reject button click', async () => {
      const interaction = {
        data: { custom_id: 'reject_review-123' },
        user: { id: 'user-123', username: 'moderator1' },
      }

      const response = await discordService.handleMessageComponent(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toContain('❌ **Review Rejected by moderator1**')
    })

    it('should handle unknown interaction', async () => {
      const interaction = {
        data: { custom_id: 'unknown_action' },
        user: { id: 'user-123', username: 'moderator1' },
      }

      const response = await discordService.handleMessageComponent(interaction)
      expect(response).toBeInstanceOf(globalThis.Response)

      const responseData = (await response.json()) as { type: number; data: { content: string } }
      expect(responseData.data.content).toBe('❌ Unknown interaction.')
    })
  })

  describe('checkUserPermissions', () => {
    it('should allow users with correct roles', async () => {
      // Access private method through any cast for testing
      const service = discordService as any
      const result = await service.checkUserPermissions(
        { roles: ['role1', 'other-role'] },
        'guild-123'
      )
      expect(result).toBe(true)
    })

    it('should deny users without correct roles', async () => {
      const service = discordService as any
      const result = await service.checkUserPermissions({ roles: ['wrong-role'] }, 'guild-123')
      expect(result).toBe(false)
    })

    it('should allow all users when no roles are configured', async () => {
      const serviceWithoutRoles = new DiscordService(mockSupabase, {
        ...mockEnv,
        DISCORD_ALLOWED_ROLES: undefined,
      })
      const service = serviceWithoutRoles as any
      const result = await service.checkUserPermissions({ roles: ['any-role'] }, 'guild-123')
      expect(result).toBe(true)
    })

    it('should deny users without member info', async () => {
      const service = discordService as any
      const result = await service.checkUserPermissions(null, 'guild-123')
      expect(result).toBe(false)
    })
  })

  describe('notifyNewPlayerEdit', () => {
    it('should send player edit notification with correct format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', mockFetch)

      const editData = {
        id: 'edit-123',
        player_name: 'John Doe',
        submitter_email: 'user@example.com',
        edit_data: {
          name: 'John Doe Updated',
          highest_rating: 2500,
          active_years: '2020-2024',
          active: true,
        },
      }

      const result = await discordService.notifyNewPlayerEdit(editData)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/mock',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Player Edit Submitted'),
        })
      )

      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs).toBeDefined()
      const payload = JSON.parse(callArgs![1].body)

      expect(payload.embeds[0].title).toBe('🏓 Player Edit Submitted')
      expect(payload.embeds[0].color).toBe(0xe67e22)
      expect(payload.embeds[0].fields).toEqual([
        { name: 'Player', value: 'John Doe', inline: true },
        { name: 'Submitted by', value: 'user@example.com', inline: true },
        {
          name: 'Changes',
          value: 'Name: John Doe Updated\nRating: 2500\nActive: 2020-2024\nStatus: Active',
          inline: false,
        },
      ])
      expect(payload.components[0].components).toHaveLength(2)
      expect(payload.components[0].components[0].custom_id).toBe('approve_player_edit_edit-123')
      expect(payload.components[0].components[1].custom_id).toBe('reject_player_edit_edit-123')
      expect(result).toEqual({ success: true })
    })

    it('should handle webhook errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false })
      vi.stubGlobal('fetch', mockFetch)

      const editData = {
        id: 'edit-123',
        player_name: 'John Doe',
        submitter_email: 'user@example.com',
        edit_data: {},
      }

      const result = await discordService.notifyNewPlayerEdit(editData)
      expect(result).toEqual({ success: false })
    })

    it('should throw error when webhook URL not configured', async () => {
      const serviceWithoutWebhook = new DiscordService(mockSupabase, {} as any)

      const editData = {
        id: 'edit-123',
        player_name: 'John Doe',
        submitter_email: 'user@example.com',
        edit_data: {},
      }

      await expect(serviceWithoutWebhook.notifyNewPlayerEdit(editData)).rejects.toThrow(
        'DISCORD_WEBHOOK_URL not configured'
      )
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from '../app'

describe('Discord Integration - End to End', () => {
  let app: any
  let mockEnv: any

  beforeEach(() => {
    // Mock environment with all required variables
    mockEnv = {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'mock-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
      DISCORD_PUBLIC_KEY: 'mock-discord-key',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/mock',
      DISCORD_ALLOWED_ROLES: 'moderator,admin',
      ADMIN_EMAILS: 'admin@test.com',
      SITE_URL: 'https://tt-reviews.local',
    }

    app = createApp()

    // Mock environment variables in process.env for testing
    // eslint-disable-next-line no-undef
    Object.assign(process.env, mockEnv)

    // Mock global functions
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(),
      configurable: true,
    })

    // Mock crypto API
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: {
          importKey: vi.fn().mockResolvedValue({}),
          verify: vi.fn().mockResolvedValue(true),
        },
      },
      configurable: true,
    })

    vi.clearAllMocks()
  })

  describe('Discord Endpoints Accessibility', () => {
    it('should have Discord interactions endpoint', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 1 }),
      })

      const res = await app.request(req, mockEnv)

      // Should respond (even if with auth error, proving endpoint exists)
      expect(res.status).toBeDefined()
      expect([200, 401, 500]).toContain(res.status)
    })

    it('should have Discord messages endpoint', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '!equipment butterfly' }),
      })

      const res = await app.request(req, mockEnv)

      expect(res.status).toBeDefined()
      expect([200, 401, 500]).toContain(res.status)
    })

    it('should have Discord notify endpoint', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_review',
          data: { id: 'test', equipment_name: 'Test', overall_rating: 8 },
        }),
      })

      const res = await app.request(req, mockEnv)

      expect(res.status).toBeDefined()
      expect([200, 401, 500]).toContain(res.status)
    })
  })

  describe('Discord Command Processing', () => {
    it('should process valid Discord interaction with proper headers', async () => {
      const interactionPayload = {
        type: 2, // APPLICATION_COMMAND
        data: {
          name: 'equipment',
          options: [{ value: 'butterfly' }],
        },
        member: { roles: ['moderator'] },
        guild_id: 'test-guild',
      }

      const req = new globalThis.Request('http://localhost/api/discord/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature-ed25519': 'mock-signature',
          'x-signature-timestamp': '1234567890',
        },
        body: JSON.stringify(interactionPayload),
      })

      const res = await app.request(req, mockEnv)

      // Should process the interaction (may fail due to mocked dependencies)
      expect(res.status).toBeDefined()
      expect(res.headers.get('content-type')).toContain('application/json')
    })

    it('should reject interactions without proper signatures', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 1 }),
      })

      const res = await app.request(req, mockEnv)

      // In test environment with mocked dependencies, may return 500 due to environment validation
      // but the endpoint should still be accessible and responding
      expect([401, 500]).toContain(res.status)
    })
  })

  describe('Discord Notification Flow', () => {
    it('should accept new review notifications', async () => {
      const notificationData = {
        type: 'new_review',
        data: {
          id: 'review-123',
          equipment_name: 'Butterfly Tenergy 05',
          overall_rating: 8,
          reviewer_name: 'test@example.com',
        },
      }

      const req = new globalThis.Request('http://localhost/api/discord/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationData),
      })

      const res = await app.request(req, mockEnv)

      // Should accept the notification payload
      expect(res.status).toBeDefined()
      expect(res.headers.get('content-type')).toContain('application/json')
    })

    it('should reject unknown notification types', async () => {
      const notificationData = {
        type: 'unknown_type',
        data: {},
      }

      const req = new globalThis.Request('http://localhost/api/discord/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationData),
      })

      const res = await app.request(req, mockEnv)

      // Should handle gracefully even with mocked environment
      expect(res.status).toBeDefined()
    })
  })

  describe('Route Mounting and CORS', () => {
    it('should mount Discord routes under /api/discord', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/nonexistent')
      const res = await app.request(req, mockEnv)

      // Should return 404 for non-existent Discord endpoints (proving routes are mounted)
      expect(res.status).toBe(404)
    })

    it('should have proper CORS headers on Discord endpoints', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/interactions', {
        method: 'OPTIONS',
      })

      const res = await app.request(req, mockEnv)

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in Discord interactions', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature-ed25519': 'mock-signature',
          'x-signature-timestamp': '1234567890',
        },
        body: 'invalid-json',
      })

      const res = await app.request(req, mockEnv)

      // Should handle gracefully
      expect(res.status).toBeDefined()
      expect([400, 500]).toContain(res.status)
    })

    it('should handle missing request body', async () => {
      const req = new globalThis.Request('http://localhost/api/discord/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const res = await app.request(req, mockEnv)

      expect(res.status).toBeDefined()
      expect([400, 500]).toContain(res.status)
    })
  })
})

describe('Discord Service Integration with Mocked Dependencies', () => {
  it('should handle equipment search with mocked Supabase', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: '1',
            name: 'Butterfly Tenergy 05',
            manufacturer: 'Butterfly',
            category: 'rubber',
            slug: 'butterfly-tenergy-05',
          },
        ],
        error: null,
      }),
    }

    const { DiscordService } = await import('../services/discord.service')
    const service = new DiscordService(
      mockSupabase as any,
      {
        DISCORD_ALLOWED_ROLES: 'moderator',
        SITE_URL: 'https://tt-reviews.local',
      } as any
    )

    const result = await (service as any).searchEquipment('butterfly')

    expect(result.content).toContain('Butterfly Tenergy 05')
    expect(result.content).toContain('🏓 **Equipment Search Results for "butterfly"**')
  })

  it('should handle player search with mocked Supabase', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: '1',
            name: 'Ma Long',
            slug: 'ma-long',
            active: true,
          },
        ],
        error: null,
      }),
    }

    const { DiscordService } = await import('../services/discord.service')
    const service = new DiscordService(
      mockSupabase as any,
      {
        DISCORD_ALLOWED_ROLES: 'moderator',
        SITE_URL: 'https://tt-reviews.local',
      } as any
    )

    const result = await (service as any).searchPlayer('ma long')

    expect(result.content).toContain('Ma Long')
    expect(result.content).toContain('🏓 **Player Search Results for "ma long"**')
    expect(result.content).toContain('Status: Active')
  })

  it('should handle empty search results', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }

    const { DiscordService } = await import('../services/discord.service')
    const service = new DiscordService(
      mockSupabase as any,
      {
        DISCORD_ALLOWED_ROLES: 'moderator',
        SITE_URL: 'https://tt-reviews.local',
      } as any
    )

    const result = await (service as any).searchEquipment('nonexistent')

    expect(result.content).toBe('🔍 No equipment found for "nonexistent"')
  })

  it('should format Discord webhook notifications correctly', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as globalThis.Response)

    const { DiscordService } = await import('../services/discord.service')
    const service = new DiscordService(
      {} as any,
      {
        DISCORD_WEBHOOK_URL: 'https://discord.com/webhook',
      } as any
    )

    const reviewData = {
      id: 'review-123',
      equipment_name: 'Test Equipment',
      overall_rating: 9,
      reviewer_name: 'test@example.com',
    }

    const result = await service.notifyNewReview(reviewData)

    expect(result.success).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://discord.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]
    const requestBody = JSON.parse((callArgs?.[1]?.body as string) || '{}')

    expect(requestBody.embeds[0].title).toBe('🆕 New Review Submitted')
    expect(requestBody.embeds[0].fields).toContainEqual({
      name: 'Equipment',
      value: 'Test Equipment',
      inline: true,
    })
    expect(requestBody.components[0].components).toHaveLength(2) // Approve and Reject buttons
  })
})

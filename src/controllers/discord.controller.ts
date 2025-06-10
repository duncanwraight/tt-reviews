import { Context } from 'hono'
import { Variables } from '../middleware/auth'
import { DiscordService } from '../services/discord.service'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { successResponse } from '../utils/response'

type HonoContext = Context<{ Variables: Variables }>

export const discordController = {
  /**
   * Handle Discord interactions (slash commands, buttons, modals)
   */
  async handleInteractions(c: HonoContext) {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const discordService = new DiscordService(supabase, env)

      const signature = c.req.header('x-signature-ed25519')
      const timestamp = c.req.header('x-signature-timestamp')
      const body = await c.req.text()

      // Verify Discord signature
      if (!signature || !timestamp) {
        return c.json({ error: 'Missing signature headers' }, 401)
      }

      const isValid = await discordService.verifySignature(signature, timestamp, body)
      if (!isValid) {
        return c.json({ error: 'Invalid signature' }, 401)
      }

      const interaction = JSON.parse(body)

      // Handle ping challenge
      if (interaction.type === 1) {
        return c.json({ type: 1 })
      }

      // Handle application commands (slash commands)
      if (interaction.type === 2) {
        return await discordService.handleSlashCommand(interaction)
      }

      // Handle message components (buttons, select menus)
      if (interaction.type === 3) {
        return await discordService.handleMessageComponent(interaction)
      }

      return c.json({ error: 'Unknown interaction type' }, 400)
    } catch (error) {
      console.error('Discord interaction error:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },

  /**
   * Handle Discord message events (for prefix commands)
   */
  async handleMessages(c: HonoContext) {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const discordService = new DiscordService(supabase, env)

      const body = await c.req.json()

      // Handle prefix commands
      if (body.content && typeof body.content === 'string') {
        const response = await discordService.handlePrefixCommand(body)
        if (response) {
          return c.json(response)
        }
      }

      return c.json({ message: 'No action taken' })
    } catch (error) {
      console.error('Discord message error:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },

  /**
   * Send notification to Discord channel
   */
  async sendNotification(c: HonoContext) {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const discordService = new DiscordService(supabase, env)

      const { type, data } = await c.req.json()

      let result
      switch (type) {
        case 'new_review':
          result = await discordService.notifyNewReview(data)
          break
        case 'review_approved':
          result = await discordService.notifyReviewApproved(data)
          break
        case 'review_rejected':
          result = await discordService.notifyReviewRejected(data)
          break
        default:
          return c.json({ error: 'Unknown notification type' }, 400)
      }

      return successResponse(c, result)
    } catch (error) {
      console.error('Discord notification error:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
}

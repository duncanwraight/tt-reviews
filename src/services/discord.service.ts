import { SupabaseClient } from '@supabase/supabase-js'
import { EquipmentService, PlayerService } from '../lib/supabase'
import { Environment } from '../types/environment'
import { ModerationService } from './moderation.service'

export class DiscordService {
  private equipmentService: EquipmentService
  private playerService: PlayerService
  private moderationService: ModerationService

  constructor(
    private supabase: SupabaseClient,
    private env: Environment
  ) {
    this.equipmentService = new EquipmentService(supabase)
    this.playerService = new PlayerService(supabase)
    this.moderationService = new ModerationService(supabase)
  }

  /**
   * Verify Discord webhook signature
   */
  async verifySignature(signature: string, timestamp: string, body: string): Promise<boolean> {
    const PUBLIC_KEY = this.env.DISCORD_PUBLIC_KEY
    if (!PUBLIC_KEY) {
      throw new Error('DISCORD_PUBLIC_KEY not configured')
    }

    // Check for placeholder values that indicate misconfiguration
    if (PUBLIC_KEY === 'your_discord_application_public_key_here' || PUBLIC_KEY.length < 32) {
      throw new Error(
        'DISCORD_PUBLIC_KEY is not properly configured - still contains placeholder or invalid value'
      )
    }

    try {
      // Use global TextEncoder and crypto available in Cloudflare Workers
      const encoder = new globalThis.TextEncoder()
      const data = encoder.encode(timestamp + body)
      const sig = hexToUint8Array(signature)

      // Import the public key
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        hexToUint8Array(PUBLIC_KEY),
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519',
        },
        false,
        ['verify']
      )

      // Verify the signature
      return await globalThis.crypto.subtle.verify('Ed25519', key, sig, data)
    } catch (error) {
      console.error('Signature verification error:', error)
      return false
    }
  }

  /**
   * Handle Discord slash commands
   */
  async handleSlashCommand(interaction: any): Promise<globalThis.Response> {
    const { data } = interaction
    const commandName = data.name

    // Check user permissions
    const hasPermission = await this.checkUserPermissions(interaction.member, interaction.guild_id)
    if (!hasPermission) {
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: '❌ You do not have permission to use this command.',
            flags: 64, // Ephemeral flag
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    switch (commandName) {
      case 'equipment':
        return await this.handleEquipmentSearch(data.options?.[0]?.value || '')
      case 'player':
        return await this.handlePlayerSearch(data.options?.[0]?.value || '')
      case 'approve':
        return await this.handleApproveReview(data.options?.[0]?.value, interaction.user)
      case 'reject':
        return await this.handleRejectReview(data.options?.[0]?.value, interaction.user)
      default:
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: '❌ Unknown command.',
              flags: 64,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
    }
  }

  /**
   * Handle Discord prefix commands (!command)
   */
  async handlePrefixCommand(message: any): Promise<any> {
    const content = message.content.trim()

    // Check user permissions
    const hasPermission = await this.checkUserPermissions(message.member, message.guild_id)
    if (!hasPermission) {
      return {
        content: '❌ You do not have permission to use this command.',
      }
    }

    if (content.startsWith('!equipment ')) {
      const query = content.slice(11).trim()
      return await this.searchEquipment(query)
    }

    if (content.startsWith('!player ')) {
      const query = content.slice(8).trim()
      return await this.searchPlayer(query)
    }

    return null
  }

  /**
   * Handle equipment search slash command
   */
  private async handleEquipmentSearch(query: string): Promise<globalThis.Response> {
    if (!query.trim()) {
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: '❌ Please provide a search query. Example: `/equipment query:butterfly`',
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const result = await this.searchEquipment(query)

    return new globalThis.Response(
      JSON.stringify({
        type: 4,
        data: result,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * Handle player search slash command
   */
  private async handlePlayerSearch(query: string): Promise<globalThis.Response> {
    if (!query.trim()) {
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: '❌ Please provide a search query. Example: `/player query:messi`',
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const result = await this.searchPlayer(query)

    return new globalThis.Response(
      JSON.stringify({
        type: 4,
        data: result,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * Search equipment and format for Discord
   */
  private async searchEquipment(query: string): Promise<any> {
    try {
      const equipment = await this.equipmentService.searchEquipment(query)

      if (equipment.length === 0) {
        return {
          content: `🔍 No equipment found for "${query}"`,
        }
      }

      const results = equipment
        .slice(0, 5)
        .map(
          item =>
            `**${item.name}** by ${item.manufacturer}\n` +
            `Type: ${item.category}\n` +
            `${this.env.SITE_URL}/equipment/${item.slug}`
        )
        .join('\n\n')

      return {
        content:
          `🏓 **Equipment Search Results for "${query}"**\n\n${results}` +
          (equipment.length > 5 ? `\n\n*Showing top 5 of ${equipment.length} results*` : ''),
      }
    } catch (error) {
      console.error('Equipment search error:', error)
      return {
        content: '❌ Error searching equipment. Please try again later.',
      }
    }
  }

  /**
   * Search players and format for Discord
   */
  private async searchPlayer(query: string): Promise<any> {
    try {
      const players = await this.playerService.searchPlayers(query)

      if (players.length === 0) {
        return {
          content: `🔍 No players found for "${query}"`,
        }
      }

      const results = players
        .slice(0, 5)
        .map(
          player =>
            `**${player.name}**\n` +
            `Status: ${player.active ? 'Active' : 'Inactive'}\n` +
            `${this.env.SITE_URL}/players/${player.slug}`
        )
        .join('\n\n')

      return {
        content:
          `🏓 **Player Search Results for "${query}"**\n\n${results}` +
          (players.length > 5 ? `\n\n*Showing top 5 of ${players.length} results*` : ''),
      }
    } catch (error) {
      console.error('Player search error:', error)
      return {
        content: '❌ Error searching players. Please try again later.',
      }
    }
  }

  /**
   * Handle message components (buttons, select menus)
   */
  async handleMessageComponent(interaction: any): Promise<globalThis.Response> {
    const customId = interaction.data.custom_id

    if (customId.startsWith('approve_player_edit_')) {
      const editId = customId.replace('approve_player_edit_', '')
      return await this.handleApprovePlayerEdit(editId, interaction.user)
    }

    if (customId.startsWith('reject_player_edit_')) {
      const editId = customId.replace('reject_player_edit_', '')
      return await this.handleRejectPlayerEdit(editId, interaction.user)
    }

    if (customId.startsWith('approve_')) {
      const reviewId = customId.replace('approve_', '')
      return await this.handleApproveReview(reviewId, interaction.user)
    }

    if (customId.startsWith('reject_')) {
      const reviewId = customId.replace('reject_', '')
      return await this.handleRejectReview(reviewId, interaction.user)
    }

    return new globalThis.Response(
      JSON.stringify({
        type: 4,
        data: {
          content: '❌ Unknown interaction.',
          flags: 64,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * Handle review approval
   */
  private async handleApproveReview(reviewId: string, user: any): Promise<globalThis.Response> {
    try {
      const result = await this.moderationService.approveReview(reviewId, user.id)

      let message: string
      let emoji: string

      switch (result.status) {
        case 'first_approval':
          emoji = '👍'
          message = `${emoji} **First Approval by ${user.username}**\nReview ${reviewId}: ${result.message}`
          break
        case 'fully_approved':
          emoji = '✅'
          message = `${emoji} **Review Fully Approved by ${user.username}**\nReview ${reviewId}: ${result.message}`
          break
        case 'already_approved':
          emoji = '⚠️'
          message = `${emoji} **${user.username}**: ${result.message}`
          break
        case 'error':
        default:
          emoji = '❌'
          message = `${emoji} **Error**: ${result.message}`
          break
      }

      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: message,
            flags: result.status === 'already_approved' || result.status === 'error' ? 64 : 0, // Ephemeral for errors/warnings
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (error) {
      console.error('Error handling approve review:', error)
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process approval`,
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  /**
   * Handle review rejection
   */
  private async handleRejectReview(reviewId: string, user: any): Promise<globalThis.Response> {
    try {
      const success = await this.moderationService.rejectReview(reviewId, user.id)

      if (success) {
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Review Rejected by ${user.username}**\nReview ${reviewId} has been rejected and will not be published.`,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } else {
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to reject review ${reviewId}. It may have already been processed.`,
              flags: 64,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    } catch (error) {
      console.error('Error handling reject review:', error)
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process rejection`,
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  /**
   * Handle player edit approval
   */
  private async handleApprovePlayerEdit(editId: string, user: any): Promise<globalThis.Response> {
    try {
      const result = await this.moderationService.approvePlayerEdit(editId, user.id)

      if (result.success) {
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **Player Edit Approved by ${user.username}**\nPlayer edit ${editId}: ${result.message}`,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } else {
        let emoji = '⚠️'
        if (result.status === 'error') {
          emoji = '❌'
        }

        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `${emoji} **Error**: ${result.message}`,
              flags: 64,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    } catch (error) {
      console.error('Error handling approve player edit:', error)
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player edit approval`,
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  /**
   * Handle player edit rejection
   */
  private async handleRejectPlayerEdit(editId: string, user: any): Promise<globalThis.Response> {
    try {
      const success = await this.moderationService.rejectPlayerEdit(editId, user.id)

      if (success) {
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Player Edit Rejected by ${user.username}**\nPlayer edit ${editId} has been rejected and changes will not be applied.`,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } else {
        return new globalThis.Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `❌ **Error**: Failed to reject player edit ${editId}. It may have already been processed.`,
              flags: 64,
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    } catch (error) {
      console.error('Error handling reject player edit:', error)
      return new globalThis.Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `❌ **Error**: Failed to process player edit rejection`,
            flags: 64,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  /**
   * Check if user has required permissions
   */
  private async checkUserPermissions(member: any, guildId: string): Promise<boolean> {
    if (!member || !member.roles) return false

    const allowedRoles = this.env.DISCORD_ALLOWED_ROLES?.split(',') || []
    if (allowedRoles.length === 0) {
      // If no roles configured, allow all users
      return true
    }

    return member.roles.some((roleId: string) => allowedRoles.includes(roleId))
  }

  /**
   * Send notification about new review submission
   */
  async notifyNewReview(reviewData: any): Promise<any> {
    const webhookUrl = this.env.DISCORD_WEBHOOK_URL
    if (!webhookUrl) {
      throw new Error('DISCORD_WEBHOOK_URL not configured')
    }

    const embed = {
      title: '🆕 New Review Submitted',
      description: `A new review has been submitted and needs moderation.`,
      color: 0x3498db,
      fields: [
        {
          name: 'Equipment',
          value: reviewData.equipment_name || 'Unknown',
          inline: true,
        },
        {
          name: 'Rating',
          value: `${reviewData.overall_rating}/10`,
          inline: true,
        },
        {
          name: 'Reviewer',
          value: reviewData.reviewer_name || 'Anonymous',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    }

    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success/Green
            label: 'Approve',
            custom_id: `approve_${reviewData.id}`,
          },
          {
            type: 2, // Button
            style: 4, // Danger/Red
            label: 'Reject',
            custom_id: `reject_${reviewData.id}`,
          },
        ],
      },
    ]

    const payload = {
      embeds: [embed],
      components,
    }

    const response = await globalThis.fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return { success: response.ok }
  }

  /**
   * Send notification about new player edit submission
   */
  async notifyNewPlayerEdit(editData: any): Promise<any> {
    const webhookUrl = this.env.DISCORD_WEBHOOK_URL
    if (!webhookUrl) {
      throw new Error('DISCORD_WEBHOOK_URL not configured')
    }

    // Create a summary of the changes
    const changes = []
    if (editData.edit_data.name) changes.push(`Name: ${editData.edit_data.name}`)
    if (editData.edit_data.highest_rating)
      changes.push(`Rating: ${editData.edit_data.highest_rating}`)
    if (editData.edit_data.active_years) changes.push(`Active: ${editData.edit_data.active_years}`)
    if (editData.edit_data.active !== undefined)
      changes.push(`Status: ${editData.edit_data.active ? 'Active' : 'Inactive'}`)

    const embed = {
      title: '🏓 Player Edit Submitted',
      description: `A player information update has been submitted and needs moderation.`,
      color: 0xe67e22, // Orange color to distinguish from reviews
      fields: [
        {
          name: 'Player',
          value: editData.player_name || 'Unknown Player',
          inline: true,
        },
        {
          name: 'Submitted by',
          value: editData.submitter_email || 'Anonymous',
          inline: true,
        },
        {
          name: 'Changes',
          value: changes.length > 0 ? changes.join('\n') : 'No changes specified',
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    }

    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success/Green
            label: 'Approve Edit',
            custom_id: `approve_player_edit_${editData.id}`,
          },
          {
            type: 2, // Button
            style: 4, // Danger/Red
            label: 'Reject Edit',
            custom_id: `reject_player_edit_${editData.id}`,
          },
        ],
      },
    ]

    const payload = {
      embeds: [embed],
      components,
    }

    const response = await globalThis.fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return { success: response.ok }
  }

  /**
   * Send notification about approved review
   */
  async notifyReviewApproved(reviewData: any): Promise<any> {
    // TODO: Implement approved review notification
    return { success: true }
  }

  /**
   * Send notification about rejected review
   */
  async notifyReviewRejected(reviewData: any): Promise<any> {
    // TODO: Implement rejected review notification
    return { success: true }
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

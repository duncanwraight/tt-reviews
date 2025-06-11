import { Context } from 'hono'
import { PlayersService } from '../services/players.service'
import { DiscordService } from '../services/discord.service'
import { successResponse } from '../utils/response'
import { NotFoundError } from '../utils/errors'
import { getAuthContext, createAuthService } from '../services/auth-wrapper.service'

export class PlayersController {
  static async getPlayer(c: Context) {
    const slug = c.req.param('slug')

    if (!slug) {
      throw new NotFoundError('Player slug is required')
    }

    // Use server-side client for public data (no auth required)
    const authService = createAuthService(c)
    const supabase = authService.createServerClient()
    const playerService = new PlayersService(supabase)

    const player = await playerService.getPlayer(slug)
    if (!player) {
      throw new NotFoundError('Player not found')
    }

    const equipmentSetups = await playerService.getPlayerEquipmentSetups(player.id)

    return successResponse(c, { success: true, player, equipmentSetups })
  }

  static async submitPlayer(c: Context) {
    const contentType = c.req.header('content-type')
    let player: any
    let equipmentSetup: any

    if (contentType?.includes('application/json')) {
      // Handle JSON submission (API usage)
      const body = await c.req.json()
      player = body.player
      equipmentSetup = body.equipmentSetup
    } else {
      // Handle form submission (progressive enhancement)
      const formData = await c.req.formData()
      player = {
        name: formData.get('name'),
        highest_rating: formData.get('highest_rating') || undefined,
        active_years: formData.get('active_years') || undefined,
        active: formData.get('active') === 'true',
      }

      // Build equipment setup from form data
      equipmentSetup = {}
      if (formData.get('blade_name')) equipmentSetup.blade_name = formData.get('blade_name')
      if (formData.get('forehand_rubber_name')) {
        equipmentSetup.forehand_rubber_name = formData.get('forehand_rubber_name')
        equipmentSetup.forehand_thickness = formData.get('forehand_thickness') || undefined
        equipmentSetup.forehand_color = formData.get('forehand_color') || undefined
      }
      if (formData.get('backhand_rubber_name')) {
        equipmentSetup.backhand_rubber_name = formData.get('backhand_rubber_name')
        equipmentSetup.backhand_thickness = formData.get('backhand_thickness') || undefined
        equipmentSetup.backhand_color = formData.get('backhand_color') || undefined
      }
      if (formData.get('year')) equipmentSetup.year = parseInt(formData.get('year') as string)
      if (formData.get('source_type')) equipmentSetup.source_type = formData.get('source_type')
      if (formData.get('source_url')) equipmentSetup.source_url = formData.get('source_url')

      // Remove empty equipment setup
      if (Object.keys(equipmentSetup).length === 0) {
        equipmentSetup = null
      }
    }

    if (!player?.name) {
      if (contentType?.includes('application/json')) {
        return c.json({ success: false, message: 'Player name is required' }, 400)
      } else {
        // For form submissions, redirect back with error
        return c.redirect('/players/submit?error=name_required', 302)
      }
    }

    try {
      // Get authenticated context for user operations
      const { supabase } = await getAuthContext(c)
      const playerService = new PlayersService(supabase)

      const createdPlayer = await playerService.createPlayer(player)
      if (!createdPlayer) {
        return c.json({ success: false, message: 'Failed to create player' }, 500)
      }

      // Add equipment setup if provided
      if (equipmentSetup && Object.keys(equipmentSetup).length > 0) {
        const setupSuccess = await playerService.addEquipmentSetup(createdPlayer.id, equipmentSetup)
        if (!setupSuccess) {
          console.warn('Player created but equipment setup failed')
        }
      }

      // Handle form submission redirect vs API response
      if (contentType?.includes('application/json')) {
        return successResponse(c, { success: true, data: createdPlayer, ...createdPlayer })
      } else {
        // Form submission - redirect to player page
        return c.redirect(`/players/${createdPlayer.slug}`, 302)
      }
    } catch (error) {
      console.error('Error submitting player:', error)
      return c.json({ success: false, message: 'Internal server error' }, 500)
    }
  }

  static async updatePlayer(c: Context) {
    const body = await c.req.json()
    const { player, equipmentSetup, slug } = body

    if (!slug && !player?.slug) {
      return c.json({ success: false, message: 'Player slug is required for updates' }, 400)
    }

    const targetSlug = slug || player.slug

    try {
      // Get authenticated context for user operations
      const { supabase } = await getAuthContext(c)
      const playerService = new PlayersService(supabase)

      const updatedPlayer = await playerService.updatePlayer(targetSlug, player)
      if (!updatedPlayer) {
        return c.json({ success: false, message: 'Player not found or update failed' }, 404)
      }

      // Add new equipment setup if provided
      if (equipmentSetup && Object.keys(equipmentSetup).length > 0) {
        const setupSuccess = await playerService.addEquipmentSetup(updatedPlayer.id, equipmentSetup)
        if (!setupSuccess) {
          console.warn('Player updated but equipment setup failed')
        }
      }

      return successResponse(c, { success: true, data: updatedPlayer, ...updatedPlayer })
    } catch (error) {
      console.error('Error updating player:', error)
      return c.json({ success: false, message: 'Internal server error' }, 500)
    }
  }

  static async addEquipmentSetup(c: Context) {
    const slug = c.req.param('slug')
    const body = await c.req.json()

    if (!slug) {
      return c.json({ success: false, message: 'Player slug is required' }, 400)
    }

    try {
      // Get authenticated context for user operations
      const { supabase } = await getAuthContext(c)
      const playerService = new PlayersService(supabase)

      // First get the player to get their ID
      const player = await playerService.getPlayer(slug)
      if (!player) {
        return c.json({ success: false, message: 'Player not found' }, 404)
      }

      const success = await playerService.addEquipmentSetup(player.id, body)
      if (!success) {
        return c.json({ success: false, message: 'Failed to add equipment setup' }, 500)
      }

      return successResponse(c, { success: true, message: 'Equipment setup added successfully' })
    } catch (error) {
      console.error('Error adding equipment setup:', error)
      return c.json({ success: false, message: 'Internal server error' }, 500)
    }
  }

  static async editPlayerInfo(c: Context) {
    const slug = c.req.param('slug')
    const body = await c.req.json()

    if (!slug) {
      return c.json({ success: false, message: 'Player slug is required' }, 400)
    }

    try {
      // Get authenticated context - this includes user, token, and authenticated Supabase client
      const { user, supabase } = await getAuthContext(c)
      const playerService = new PlayersService(supabase)

      // First get the player to verify it exists
      const player = await playerService.getPlayer(slug)
      if (!player) {
        return c.json({ success: false, message: 'Player not found' }, 404)
      }

      // Create a moderated player edit entry
      const editId = await playerService.submitPlayerEdit(player.id, body, user.id)
      if (!editId) {
        return c.json({ success: false, message: 'Failed to submit player edit' }, 500)
      }

      // Send Discord notification for new player edit submission
      try {
        const env = c.env as any
        if (env?.DISCORD_WEBHOOK_URL) {
          const authService = createAuthService(c)
          const supabase = authService.createServerClient()
          const discordService = new DiscordService(supabase, env)

          await discordService.notifyNewPlayerEdit({
            id: editId,
            player_name: player.name,
            submitter_email: user.email || 'Anonymous',
            edit_data: body,
          })
        }
      } catch (error) {
        // Don't fail the player edit submission if Discord notification fails
        console.error('Failed to send Discord notification for player edit:', error)
      }

      return successResponse(c, {
        success: true,
        message: 'Player edit submitted for moderation review',
      })
    } catch (error) {
      console.error('Error submitting player edit:', error)
      return c.json({ success: false, message: 'Internal server error' }, 500)
    }
  }
}

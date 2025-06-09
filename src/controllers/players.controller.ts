import { Context } from 'hono'
import { PlayersService } from '../services/players.service'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { successResponse } from '../utils/response'
import { NotFoundError } from '../utils/errors'

export class PlayersController {
  static async getPlayer(c: Context) {
    const slug = c.req.param('slug')

    if (!slug) {
      throw new NotFoundError('Player slug is required')
    }

    const env = validateEnvironment(c.env)
    const supabase = createSupabaseClient(env)
    const playerService = new PlayersService(supabase)

    const player = await playerService.getPlayer(slug)
    if (!player) {
      throw new NotFoundError('Player not found')
    }

    const equipmentSetups = await playerService.getPlayerEquipmentSetups(player.id)

    return successResponse(c, { player, equipmentSetups })
  }
}

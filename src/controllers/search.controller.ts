import { Context } from 'hono'
import { EquipmentService } from '../services/equipment.service'
import { PlayersService } from '../services/players.service'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { successResponse } from '../utils/response'
import { ValidationError } from '../utils/errors'

export class SearchController {
  static async search(c: Context) {
    const query = c.req.query('q')

    if (!query) {
      throw new ValidationError('Search query required')
    }

    const env = validateEnvironment(c.env)
    const supabase = createSupabaseClient(env)
    const equipmentService = new EquipmentService(supabase)
    const playerService = new PlayersService(supabase)

    const [equipment, players] = await Promise.all([
      equipmentService.searchEquipment(query),
      playerService.searchPlayers(query),
    ])

    return successResponse(c, { equipment, players })
  }
}

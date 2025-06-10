import { Context } from 'hono'
import { EquipmentService } from '../services/equipment.service'
import { PlayersService } from '../services/players.service'
import { createAuthService } from '../services/auth-wrapper.service'
import { successResponse } from '../utils/response'
import { ValidationError } from '../utils/errors'

export class SearchController {
  static async search(c: Context) {
    const query = c.req.query('q')

    if (!query) {
      throw new ValidationError('Search query required')
    }

    const authService = createAuthService(c)
    const supabase = authService.createServerClient()
    const equipmentService = new EquipmentService(supabase)
    const playerService = new PlayersService(supabase)

    const [equipment, players] = await Promise.all([
      equipmentService.searchEquipment(query),
      playerService.searchPlayers(query),
    ])

    return successResponse(c, { equipment, players })
  }
}

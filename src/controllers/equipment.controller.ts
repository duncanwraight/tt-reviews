import { Context } from 'hono'
import { EquipmentService } from '../services/equipment.service'
import { createSupabaseClient } from '../config/database'
import { validateEnvironment } from '../config/environment'
import { successResponse } from '../utils/response'
import { NotFoundError } from '../utils/errors'

export class EquipmentController {
  static async getEquipment(c: Context) {
    const slug = c.req.param('slug')

    if (!slug) {
      throw new NotFoundError('Equipment slug is required')
    }

    const env = validateEnvironment(c.env)
    const supabase = createSupabaseClient(env)
    const equipmentService = new EquipmentService(supabase)

    const equipment = await equipmentService.getEquipment(slug)
    if (!equipment) {
      throw new NotFoundError('Equipment not found')
    }

    const reviews = await equipmentService.getEquipmentReviews(equipment.id)

    return successResponse(c, { equipment, reviews })
  }
}

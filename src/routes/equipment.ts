import { Hono } from 'hono'
import { EquipmentController } from '../controllers/equipment.controller.js'
import { createSupabaseClient } from '../config/database.js'
import { validateEnvironment } from '../config/environment.js'
import { EquipmentService } from '../services/equipment.service.js'
import { Variables } from '../middleware/auth.js'

const equipment = new Hono<{ Variables: Variables }>()

equipment.use('*', async (c, next) => {
  const env = validateEnvironment(c.env)
  const supabase = createSupabaseClient(env)
  const equipmentService = new EquipmentService(supabase)
  const controller = new EquipmentController(equipmentService)
  c.set('equipmentController', controller)
  await next()
})

equipment.get('/:slug', async c => {
  const controller = c.get('equipmentController') as EquipmentController
  return controller.getEquipment(c)
})

equipment.get('/:equipmentId/reviews', async c => {
  const controller = c.get('equipmentController') as EquipmentController
  return controller.getEquipmentReviews(c)
})

equipment.get('/legacy/:slug', EquipmentController.getEquipmentLegacy)

export { equipment }

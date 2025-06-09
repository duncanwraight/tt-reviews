import { Hono } from 'hono'
import { EquipmentController } from '../controllers/equipment.controller'

const equipment = new Hono()

equipment.get('/:slug', EquipmentController.getEquipment)

export { equipment }

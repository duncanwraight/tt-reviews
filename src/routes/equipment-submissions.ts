import { Hono } from 'hono'
import {
  showEquipmentSubmitForm,
  submitEquipment,
} from '../controllers/equipment-submissions.controller.js'

const equipmentSubmissions = new Hono()

// Equipment submission form
equipmentSubmissions.get('/submit', showEquipmentSubmitForm)

// Submit new equipment
equipmentSubmissions.post('/submit', submitEquipment)

export { equipmentSubmissions }

import { Hono } from 'hono'
import {
  showEquipmentSubmitForm,
  submitEquipment,
} from '../controllers/equipment-submissions.controller.js'
import { enhancedAuth, EnhancedAuthVariables } from '../middleware/auth-enhanced'

const equipmentSubmissions = new Hono()

// Equipment submission form (web page - handles auth client-side like other pages)
equipmentSubmissions.get('/submit', showEquipmentSubmitForm)

// Submit new equipment API (requires Bearer token)
equipmentSubmissions.post('/submit', enhancedAuth, submitEquipment)

export { equipmentSubmissions }

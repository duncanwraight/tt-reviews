import { Hono } from 'hono';
import { submitEquipment } from '../controllers/equipment-submissions.controller.js';
import { enhancedAuth } from '../middleware/auth-enhanced';
const equipmentSubmissions = new Hono();
// Submit new equipment API (requires Bearer token)
equipmentSubmissions.post('/submit', enhancedAuth, submitEquipment);
export { equipmentSubmissions };

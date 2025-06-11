import { Hono } from 'hono';
import { EquipmentController } from '../controllers/equipment.controller.js';
import { optionalAuth } from '../middleware/auth-enhanced';
import { EquipmentService } from '../services/equipment.service.js';
const equipment = new Hono();
// Use optional auth for public equipment endpoints (works for both authenticated and anonymous users)
equipment.use('*', optionalAuth);
equipment.use('*', async (c, next) => {
    const authService = c.get('authService');
    // For public endpoints, use server client (no user context needed for reading equipment)
    const supabase = authService.createServerClient();
    const equipmentService = new EquipmentService(supabase);
    const controller = new EquipmentController(equipmentService);
    c.set('equipmentController', controller);
    await next();
});
equipment.get('/:slug', async (c) => {
    const controller = c.get('equipmentController');
    return controller.getEquipment(c);
});
equipment.get('/:equipmentId/reviews', async (c) => {
    const controller = c.get('equipmentController');
    return controller.getEquipmentReviews(c);
});
equipment.get('/legacy/:slug', EquipmentController.getEquipmentLegacy);
export { equipment };

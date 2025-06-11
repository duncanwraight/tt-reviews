import { Hono } from 'hono';
import { ReviewsController } from '../controllers/reviews.controller.js';
import { enhancedAuth } from '../middleware/auth-enhanced';
import { createAuthService } from '../services/auth-wrapper.service';
import { EquipmentService } from '../services/equipment.service.js';
export function createReviewsRoutes() {
    const app = new Hono();
    // All routes require authentication
    app.use('*', enhancedAuth);
    app.post('/', async (c) => {
        const authService = createAuthService(c);
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const controller = new ReviewsController(equipmentService);
        return controller.createReview(c);
    });
    app.get('/user', async (c) => {
        const authService = createAuthService(c);
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const controller = new ReviewsController(equipmentService);
        return controller.getUserReviews(c);
    });
    app.get('/user/:equipmentId', async (c) => {
        const authService = createAuthService(c);
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const controller = new ReviewsController(equipmentService);
        return controller.getUserReview(c);
    });
    app.put('/:reviewId', async (c) => {
        const authService = createAuthService(c);
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const controller = new ReviewsController(equipmentService);
        return controller.updateReview(c);
    });
    app.delete('/:reviewId', async (c) => {
        const authService = createAuthService(c);
        const supabase = await authService.getAuthenticatedClient(c);
        const equipmentService = new EquipmentService(supabase);
        const controller = new ReviewsController(equipmentService);
        return controller.deleteReview(c);
    });
    return app;
}

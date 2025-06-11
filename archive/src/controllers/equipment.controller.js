import { EquipmentService } from '../services/equipment.service.js';
import { createAuthService } from '../services/auth-wrapper.service';
import { createResponse, createErrorResponse } from '../utils/response.js';
export class EquipmentController {
    equipmentService;
    constructor(equipmentService) {
        this.equipmentService = equipmentService;
    }
    async getEquipment(c) {
        try {
            const slug = c.req.param('slug');
            if (!slug) {
                return createErrorResponse(c, 'Equipment slug is required', 400);
            }
            const equipment = await this.equipmentService.getEquipment(slug);
            if (!equipment) {
                return createErrorResponse(c, 'Equipment not found', 404);
            }
            const reviews = await this.equipmentService.getEquipmentReviews(equipment.id);
            return createResponse(c, { equipment, reviews });
        }
        catch (error) {
            console.error('Error fetching equipment:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    async getEquipmentReviews(c) {
        try {
            const equipmentId = c.req.param('equipmentId');
            if (!equipmentId) {
                return createErrorResponse(c, 'Equipment ID is required', 400);
            }
            const page = parseInt(c.req.query('page') || '1');
            const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);
            const status = c.req.query('status') === 'all' ? 'all' : 'approved';
            if (page < 1 || limit < 1) {
                return createErrorResponse(c, 'Page and limit must be positive integers', 400);
            }
            const reviews = await this.equipmentService.getEquipmentReviews(equipmentId, status);
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedReviews = reviews.slice(startIndex, endIndex);
            return createResponse(c, {
                reviews: paginatedReviews,
                total: reviews.length,
                page,
                limit,
            });
        }
        catch (error) {
            console.error('Error fetching equipment reviews:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    static async getEquipmentLegacy(c) {
        const slug = c.req.param('slug');
        if (!slug) {
            return createErrorResponse(c, 'Equipment slug is required', 400);
        }
        const authService = createAuthService(c);
        const supabase = authService.createServerClient();
        const equipmentService = new EquipmentService(supabase);
        const equipment = await equipmentService.getEquipment(slug);
        if (!equipment) {
            return createErrorResponse(c, 'Equipment not found', 404);
        }
        const reviews = await equipmentService.getEquipmentReviews(equipment.id);
        return createResponse(c, { equipment, reviews });
    }
}

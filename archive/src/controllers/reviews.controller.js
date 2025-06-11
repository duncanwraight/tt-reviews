import { createResponse, createErrorResponse } from '../utils/response.js';
import { DiscordService } from '../services/discord.service';
import { createAuthService } from '../services/auth-wrapper.service';
import { validateEnvironment } from '../config/environment';
export class ReviewsController {
    equipmentService;
    constructor(equipmentService) {
        this.equipmentService = equipmentService;
    }
    async createReview(c) {
        try {
            const user = c.get('user');
            if (!user) {
                return createErrorResponse(c, 'Unauthorized', 401);
            }
            const body = (await c.req.json());
            if (!body.equipment_id || !body.overall_rating || !body.category_ratings) {
                return createErrorResponse(c, 'Missing required fields: equipment_id, overall_rating, category_ratings', 400);
            }
            if (body.overall_rating < 1 || body.overall_rating > 10) {
                return createErrorResponse(c, 'Overall rating must be between 1 and 10', 400);
            }
            const existingReview = await this.equipmentService.getUserReview(user.id, body.equipment_id);
            if (existingReview) {
                return createErrorResponse(c, 'User has already reviewed this equipment', 409);
            }
            const review = await this.equipmentService.createReview(user.id, body.equipment_id, body.overall_rating, body.category_ratings, body.review_text, body.reviewer_context);
            if (!review) {
                return createErrorResponse(c, 'Failed to create review', 500);
            }
            // Send Discord notification for new review
            try {
                const env = validateEnvironment(c.env);
                if (env.DISCORD_WEBHOOK_URL) {
                    const authService = createAuthService(c);
                    const supabase = authService.createServerClient();
                    const discordService = new DiscordService(supabase, env);
                    // Get equipment details for the notification
                    const equipment = await this.equipmentService.getEquipmentById(body.equipment_id);
                    await discordService.notifyNewReview({
                        id: review.id,
                        equipment_name: equipment?.name || 'Unknown Equipment',
                        overall_rating: body.overall_rating,
                        reviewer_name: user.email || 'Anonymous',
                    });
                }
            }
            catch (error) {
                // Don't fail the review creation if Discord notification fails
                console.error('Failed to send Discord notification:', error);
            }
            return createResponse(c, { review }, 201);
        }
        catch (error) {
            console.error('Error creating review:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    async getUserReview(c) {
        try {
            const user = c.get('user');
            if (!user) {
                return createErrorResponse(c, 'Unauthorized', 401);
            }
            const equipmentId = c.req.param('equipmentId');
            if (!equipmentId) {
                return createErrorResponse(c, 'Equipment ID is required', 400);
            }
            const review = await this.equipmentService.getUserReview(user.id, equipmentId);
            return createResponse(c, { review });
        }
        catch (error) {
            console.error('Error fetching user review:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    async updateReview(c) {
        try {
            const user = c.get('user');
            if (!user) {
                return createErrorResponse(c, 'Unauthorized', 401);
            }
            const reviewId = c.req.param('reviewId');
            if (!reviewId) {
                return createErrorResponse(c, 'Review ID is required', 400);
            }
            const body = (await c.req.json());
            if (body.overall_rating !== undefined &&
                (body.overall_rating < 1 || body.overall_rating > 10)) {
                return createErrorResponse(c, 'Overall rating must be between 1 and 10', 400);
            }
            const review = await this.equipmentService.updateReview(reviewId, user.id, body.overall_rating, body.category_ratings, body.review_text, body.reviewer_context);
            if (!review) {
                return createErrorResponse(c, 'Review not found or cannot be updated', 404);
            }
            return createResponse(c, { review });
        }
        catch (error) {
            console.error('Error updating review:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    async deleteReview(c) {
        try {
            const user = c.get('user');
            if (!user) {
                return createErrorResponse(c, 'Unauthorized', 401);
            }
            const reviewId = c.req.param('reviewId');
            if (!reviewId) {
                return createErrorResponse(c, 'Review ID is required', 400);
            }
            const success = await this.equipmentService.deleteReview(reviewId, user.id);
            if (!success) {
                return createErrorResponse(c, 'Review not found or cannot be deleted', 404);
            }
            return createResponse(c, { message: 'Review deleted successfully' });
        }
        catch (error) {
            console.error('Error deleting review:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
    async getUserReviews(c) {
        try {
            const user = c.get('user');
            if (!user) {
                return createErrorResponse(c, 'Unauthorized', 401);
            }
            const page = parseInt(c.req.query('page') || '1');
            const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);
            if (page < 1 || limit < 1) {
                return createErrorResponse(c, 'Page and limit must be positive integers', 400);
            }
            const { reviews, total } = await this.equipmentService.getUserReviews(user.id, page, limit);
            const response = {
                reviews,
                total,
                page,
                limit,
            };
            return createResponse(c, response);
        }
        catch (error) {
            console.error('Error fetching user reviews:', error);
            return createErrorResponse(c, 'Internal server error', 500);
        }
    }
}

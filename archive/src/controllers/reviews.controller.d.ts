import { Context } from 'hono';
import { EquipmentService } from '../services/equipment.service.js';
export declare class ReviewsController {
    private equipmentService;
    constructor(equipmentService: EquipmentService);
    createReview(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    getUserReview(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    updateReview(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    deleteReview(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    getUserReviews(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
}
//# sourceMappingURL=reviews.controller.d.ts.map
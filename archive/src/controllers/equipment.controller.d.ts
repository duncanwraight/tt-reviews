import { Context } from 'hono';
import { EquipmentService } from '../services/equipment.service.js';
export declare class EquipmentController {
    private equipmentService;
    constructor(equipmentService: EquipmentService);
    getEquipment(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    getEquipmentReviews(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static getEquipmentLegacy(c: Context): Promise<Response & import("hono").TypedResponse<{
        error: string;
        code: string | undefined;
        timestamp: string;
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
}
//# sourceMappingURL=equipment.controller.d.ts.map
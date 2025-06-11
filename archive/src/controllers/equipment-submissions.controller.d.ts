import { Context } from 'hono';
export declare function showEquipmentSubmitForm(c: Context): Promise<Response>;
export declare function submitEquipment(c: Context): Promise<(Response & import("hono").TypedResponse<{
    success: false;
    error: string;
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    success: true;
    message: string;
    submissionId: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
    success: false;
    error: string;
}, 500, "json">)>;
//# sourceMappingURL=equipment-submissions.controller.d.ts.map
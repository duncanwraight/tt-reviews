import { Context } from 'hono';
export declare function successResponse(c: Context, data: object | string | number | boolean | null, status?: number): Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">;
export declare function createResponse(c: Context, data: object | string | number | boolean | null, status?: number): Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">;
export declare function errorResponse(c: Context, message: string, status?: number, code?: string): Response & import("hono").TypedResponse<{
    error: string;
    code: string | undefined;
    timestamp: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">;
export declare function createErrorResponse(c: Context, message: string, status?: number, code?: string): Response & import("hono").TypedResponse<{
    error: string;
    code: string | undefined;
    timestamp: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">;
//# sourceMappingURL=response.d.ts.map
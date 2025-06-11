import { Context, Next } from 'hono';
export declare function errorHandler(c: Context, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
    code: string | undefined;
    timestamp: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">) | undefined>;
//# sourceMappingURL=error.d.ts.map
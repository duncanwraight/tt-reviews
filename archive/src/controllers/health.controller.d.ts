import { Context } from 'hono';
export declare class HealthController {
    static healthCheck(c: Context): Promise<Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
    static hello(c: Context): Promise<Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
}
//# sourceMappingURL=health.controller.d.ts.map
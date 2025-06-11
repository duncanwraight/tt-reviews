import { Context, Next } from 'hono';
import { BindingsEnv } from '../types/environment';
import { EnhancedAuthVariables } from './auth-enhanced';
export declare function requireAdmin(c: Context<BindingsEnv & {
    Variables: EnhancedAuthVariables;
}>, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
}, 401, "json">) | (Response & import("hono").TypedResponse<{
    error: string;
}, 403, "json">) | (Response & import("hono").TypedResponse<{
    error: string;
}, 500, "json">) | undefined>;
//# sourceMappingURL=admin.d.ts.map
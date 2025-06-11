import { Hono } from 'hono';
import { EnhancedAuthVariables } from './middleware/auth-enhanced';
export declare function createApp(): Hono<{
    Variables: EnhancedAuthVariables;
}>;
//# sourceMappingURL=app.d.ts.map
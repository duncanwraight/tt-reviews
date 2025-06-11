import { Hono } from 'hono';
import { BindingsEnv } from '../types/environment';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
declare const moderation: Hono<BindingsEnv & {
    Variables: EnhancedAuthVariables;
}, import("hono/types").BlankSchema, "/">;
export { moderation };
//# sourceMappingURL=moderation.d.ts.map
import { Hono } from 'hono';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
import { SecureAuthVariables } from '../middleware/auth-secure';
declare const auth: Hono<{
    Variables: EnhancedAuthVariables | SecureAuthVariables;
}, import("hono/types").BlankSchema, "/">;
export { auth };
//# sourceMappingURL=auth.d.ts.map
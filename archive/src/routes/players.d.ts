import { Hono } from 'hono';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
declare const players: Hono<{
    Variables: EnhancedAuthVariables;
}, import("hono/types").BlankSchema, "/">;
export { players };
//# sourceMappingURL=players.d.ts.map
import { Hono } from 'hono';
import { User } from '@supabase/supabase-js';
type Variables = {
    user: User;
};
declare const app: Hono<{
    Variables: Variables;
}, import("hono/types").BlankSchema, "/">;
export default app;
//# sourceMappingURL=index.old.d.ts.map
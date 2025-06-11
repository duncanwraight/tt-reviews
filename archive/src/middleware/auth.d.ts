import { Context, Next } from 'hono';
import { User } from '@supabase/supabase-js';
export type Variables = {
    user: User;
    isAdmin?: boolean;
    equipmentController: unknown;
    reviewsController: unknown;
};
export declare function requireAuth(c: Context<{
    Variables: Variables;
}>, next: Next): Promise<void>;
export declare const authMiddleware: typeof requireAuth;
//# sourceMappingURL=auth.d.ts.map
import { Context, Next } from 'hono';
import { User } from '@supabase/supabase-js';
import { AuthWrapperService, AuthContext } from '../services/auth-wrapper.service';
export type EnhancedAuthVariables = {
    user: User;
    authService: AuthWrapperService;
    authContext: AuthContext;
};
/**
 * Enhanced auth middleware that provides full auth context
 * This replaces the basic requireAuth middleware for protected routes
 */
export declare function enhancedAuth(c: Context<{
    Variables: EnhancedAuthVariables;
}>, next: Next): Promise<void>;
/**
 * Admin-only auth middleware
 */
export declare function requireAdmin(c: Context<{
    Variables: EnhancedAuthVariables;
}>, next: Next): Promise<void>;
/**
 * Optional auth middleware - doesn't throw if no auth provided
 * Useful for endpoints that work for both authenticated and anonymous users
 */
export declare function optionalAuth(c: Context<{
    Variables: Partial<EnhancedAuthVariables>;
}>, next: Next): Promise<void>;
//# sourceMappingURL=auth-enhanced.d.ts.map
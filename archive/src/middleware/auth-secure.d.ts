/**
 * Secure authentication middleware with HTTP-only cookie support and CSRF protection
 */
import { Context, Next } from 'hono';
import { User } from '@supabase/supabase-js';
import { CookieAuthService, SessionData } from '../services/cookie-auth.service';
import { AuthContext } from '../services/auth-wrapper.service';
export type SecureAuthVariables = {
    user: User;
    authService: CookieAuthService;
    authContext: AuthContext;
    sessionData?: SessionData;
    csrfToken?: string;
};
/**
 * Secure auth middleware that supports both Bearer tokens and HTTP-only cookies
 */
export declare function secureAuth(c: Context<{
    Variables: SecureAuthVariables;
}>, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
}, 401, "json">) | undefined>;
/**
 * Optional secure auth - doesn't throw if no auth provided
 */
export declare function optionalSecureAuth(c: Context<{
    Variables: Partial<SecureAuthVariables>;
}>, next: Next): Promise<void>;
/**
 * Admin-only secure auth middleware
 */
export declare function requireSecureAdmin(c: Context<{
    Variables: SecureAuthVariables;
}>, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
}, 403, "json">) | undefined>;
/**
 * CSRF protection middleware for state-changing operations
 */
export declare function requireCSRF(c: Context<{
    Variables: SecureAuthVariables;
}>, next: Next): Promise<(Response & import("hono").TypedResponse<{
    error: string;
}, 500, "json">) | (Response & import("hono").TypedResponse<{
    error: string;
}, 403, "json">) | undefined>;
/**
 * Middleware to inject CSRF token into context for forms
 */
export declare function injectCSRF(c: Context<{
    Variables: SecureAuthVariables;
}>, next: Next): Promise<void>;
//# sourceMappingURL=auth-secure.d.ts.map
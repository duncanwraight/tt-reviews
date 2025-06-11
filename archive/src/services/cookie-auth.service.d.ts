/**
 * Cookie-based authentication service for secure session management
 * Provides HTTP-only cookie support alongside Bearer token authentication
 */
import { Context } from 'hono';
import { AuthWrapperService, AuthContext } from './auth-wrapper.service';
export interface SessionData {
    access_token: string;
    refresh_token?: string;
    expires_at: number;
    user_id: string;
}
export declare class CookieAuthService extends AuthWrapperService {
    private readonly SESSION_COOKIE_NAME;
    private readonly CSRF_COOKIE_NAME;
    private readonly COOKIE_MAX_AGE;
    /**
     * Set secure session cookie with HTTP-only flags
     */
    setSessionCookie(c: Context, sessionData: SessionData): void;
    /**
     * Get session data from secure cookie
     */
    getSessionFromCookie(c: Context): SessionData | null;
    /**
     * Clear session cookie
     */
    clearSessionCookie(c: Context): void;
    /**
     * Generate and set CSRF token
     */
    setCSRFToken(c: Context): string;
    /**
     * Validate CSRF token
     */
    validateCSRFToken(c: Context, providedToken?: string): boolean;
    /**
     * Generate cryptographically secure CSRF token
     */
    private generateCSRFToken;
    /**
     * Enhanced auth context that checks both Bearer tokens and cookies
     */
    getAuthContext(c: Context): Promise<AuthContext>;
    /**
     * Optional auth that works with both Bearer tokens and cookies
     */
    getOptionalAuthContext(c: Context): Promise<AuthContext | null>;
    /**
     * Sign in user and set secure session cookie
     */
    signInWithCookie(c: Context, email: string, password: string): Promise<{
        user: any;
        session: any;
        csrfToken: string;
        error: Error | null;
    }>;
    /**
     * Sign out user and clear cookies
     */
    signOutWithCookie(c: Context): Promise<{
        error: Error | null;
    }>;
}
//# sourceMappingURL=cookie-auth.service.d.ts.map
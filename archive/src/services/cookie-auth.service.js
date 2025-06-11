/**
 * Cookie-based authentication service for secure session management
 * Provides HTTP-only cookie support alongside Bearer token authentication
 */
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { AuthWrapperService } from './auth-wrapper.service';
import { AuthenticationError } from '../utils/errors';
export class CookieAuthService extends AuthWrapperService {
    SESSION_COOKIE_NAME = 'session';
    CSRF_COOKIE_NAME = 'csrf_token';
    COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
    /**
     * Set secure session cookie with HTTP-only flags
     */
    setSessionCookie(c, sessionData) {
        const secureSessionData = JSON.stringify({
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
            expires_at: sessionData.expires_at,
            user_id: sessionData.user_id,
        });
        setCookie(c, this.SESSION_COOKIE_NAME, secureSessionData, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: this.COOKIE_MAX_AGE,
            path: '/',
        });
    }
    /**
     * Get session data from secure cookie
     */
    getSessionFromCookie(c) {
        try {
            const sessionCookie = getCookie(c, this.SESSION_COOKIE_NAME);
            if (!sessionCookie) {
                return null;
            }
            const sessionData = JSON.parse(sessionCookie);
            // Check if session is expired
            if (sessionData.expires_at && Date.now() > sessionData.expires_at * 1000) {
                this.clearSessionCookie(c);
                return null;
            }
            return sessionData;
        }
        catch (error) {
            console.error('Error parsing session cookie:', error);
            this.clearSessionCookie(c);
            return null;
        }
    }
    /**
     * Clear session cookie
     */
    clearSessionCookie(c) {
        deleteCookie(c, this.SESSION_COOKIE_NAME, {
            path: '/',
        });
    }
    /**
     * Generate and set CSRF token
     */
    setCSRFToken(c) {
        const csrfToken = this.generateCSRFToken();
        setCookie(c, this.CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false, // Need to be readable by JavaScript for form submissions
            secure: true,
            sameSite: 'Strict',
            maxAge: this.COOKIE_MAX_AGE,
            path: '/',
        });
        return csrfToken;
    }
    /**
     * Validate CSRF token
     */
    validateCSRFToken(c, providedToken) {
        const storedToken = getCookie(c, this.CSRF_COOKIE_NAME);
        if (!storedToken || !providedToken) {
            return false;
        }
        return storedToken === providedToken;
    }
    /**
     * Generate cryptographically secure CSRF token
     */
    generateCSRFToken() {
        const array = new Uint8Array(32);
        // Use crypto from different sources depending on environment
        if (typeof globalThis !== 'undefined' && globalThis.crypto) {
            ;
            globalThis.crypto.getRandomValues(array);
        }
        else {
            // Fallback for Node.js environments
            try {
                const { randomFillSync } = eval('require')('node:crypto');
                randomFillSync(array);
            }
            catch {
                // Fallback to Math.random if crypto is not available
                for (let i = 0; i < array.length; i++) {
                    array[i] = Math.floor(Math.random() * 256);
                }
            }
        }
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    /**
     * Enhanced auth context that checks both Bearer tokens and cookies
     */
    async getAuthContext(c) {
        // First try Bearer token authentication (for API calls)
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return super.getAuthContext(c);
        }
        // Then try cookie authentication (for browser requests)
        const sessionData = this.getSessionFromCookie(c);
        if (!sessionData) {
            throw new AuthenticationError('No valid authentication found');
        }
        // Create authenticated Supabase client with session token
        const supabase = this.createAuthenticatedClient(sessionData.access_token);
        // Validate token and get user
        const user = await this.validateTokenAndGetUser(sessionData.access_token, supabase);
        // Check admin status
        const isAdmin = this.isUserAdmin(user);
        return {
            user,
            token: sessionData.access_token,
            supabase,
            isAdmin,
        };
    }
    /**
     * Optional auth that works with both Bearer tokens and cookies
     */
    async getOptionalAuthContext(c) {
        try {
            return await this.getAuthContext(c);
        }
        catch {
            return null;
        }
    }
    /**
     * Sign in user and set secure session cookie
     */
    async signInWithCookie(c, email, password) {
        try {
            const supabase = this.createServerClient();
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error || !data.user || !data.session) {
                return {
                    user: null,
                    session: null,
                    csrfToken: '',
                    error: new Error(error?.message || 'Sign in failed'),
                };
            }
            // Set secure session cookie
            const sessionData = {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at || 0,
                user_id: data.user.id,
            };
            this.setSessionCookie(c, sessionData);
            // Generate and set CSRF token
            const csrfToken = this.setCSRFToken(c);
            return {
                user: data.user,
                session: data.session,
                csrfToken,
                error: null,
            };
        }
        catch (error) {
            return {
                user: null,
                session: null,
                csrfToken: '',
                error: error,
            };
        }
    }
    /**
     * Sign out user and clear cookies
     */
    async signOutWithCookie(c) {
        try {
            // Try to get current session to sign out properly
            const sessionData = this.getSessionFromCookie(c);
            if (sessionData) {
                const supabase = this.createAuthenticatedClient(sessionData.access_token);
                await supabase.auth.signOut();
            }
            // Clear cookies regardless
            this.clearSessionCookie(c);
            deleteCookie(c, this.CSRF_COOKIE_NAME, { path: '/' });
            return { error: null };
        }
        catch (error) {
            // Clear cookies even if API call fails
            this.clearSessionCookie(c);
            deleteCookie(c, this.CSRF_COOKIE_NAME, { path: '/' });
            return { error: error };
        }
    }
}

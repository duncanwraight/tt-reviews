/**
 * Secure authentication middleware with HTTP-only cookie support and CSRF protection
 */
import { CookieAuthService } from '../services/cookie-auth.service';
import { validateEnvironment } from '../config/environment';
import { AuthenticationError } from '../utils/errors';
/**
 * Secure auth middleware that supports both Bearer tokens and HTTP-only cookies
 */
export async function secureAuth(c, next) {
    const env = validateEnvironment(c.env);
    const authService = new CookieAuthService(env);
    try {
        const authContext = await authService.getAuthContext(c);
        const sessionData = authService.getSessionFromCookie(c);
        c.set('user', authContext.user);
        c.set('authService', authService);
        c.set('authContext', authContext);
        if (sessionData) {
            c.set('sessionData', sessionData);
        }
        await next();
    }
    catch (error) {
        if (error instanceof AuthenticationError) {
            return c.json({ error: error.message }, 401);
        }
        throw error;
    }
}
/**
 * Optional secure auth - doesn't throw if no auth provided
 */
export async function optionalSecureAuth(c, next) {
    const env = validateEnvironment(c.env);
    const authService = new CookieAuthService(env);
    try {
        const authContext = await authService.getOptionalAuthContext(c);
        const sessionData = authService.getSessionFromCookie(c);
        c.set('authService', authService);
        if (authContext) {
            c.set('user', authContext.user);
            c.set('authContext', authContext);
        }
        if (sessionData) {
            c.set('sessionData', sessionData);
        }
        await next();
    }
    catch {
        // Continue without auth if validation fails
        c.set('authService', authService);
        await next();
    }
}
/**
 * Admin-only secure auth middleware
 */
export async function requireSecureAdmin(c, next) {
    const env = validateEnvironment(c.env);
    const authService = new CookieAuthService(env);
    try {
        const authContext = await authService.requireAdmin(c);
        const sessionData = authService.getSessionFromCookie(c);
        c.set('user', authContext.user);
        c.set('authService', authService);
        c.set('authContext', authContext);
        if (sessionData) {
            c.set('sessionData', sessionData);
        }
        await next();
    }
    catch (error) {
        if (error instanceof AuthenticationError) {
            return c.json({ error: error.message }, 403);
        }
        throw error;
    }
}
/**
 * CSRF protection middleware for state-changing operations
 */
export async function requireCSRF(c, next) {
    const authService = c.get('authService');
    if (!authService) {
        return c.json({ error: 'Authentication service not available' }, 500);
    }
    // Skip CSRF check for API calls with Bearer tokens (they should use other CSRF protection)
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        await next();
        return;
    }
    // For cookie-based requests, require CSRF token
    const csrfToken = c.req.header('X-CSRF-Token') ||
        (await c.req
            .formData()
            .then(fd => fd.get('csrf_token'))
            .catch(() => undefined));
    if (!authService.validateCSRFToken(c, csrfToken)) {
        return c.json({ error: 'Invalid CSRF token' }, 403);
    }
    await next();
}
/**
 * Middleware to inject CSRF token into context for forms
 */
export async function injectCSRF(c, next) {
    const authService = c.get('authService');
    if (authService) {
        const csrfToken = authService.setCSRFToken(c);
        c.set('csrfToken', csrfToken);
    }
    await next();
}

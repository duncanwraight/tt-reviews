import { redirect } from 'react-router'
import type { AppLoadContext } from 'react-router'
import { AuthService, type AuthContext } from './auth.server'

// Get authenticated user or redirect to login
export async function requireAuth(
  request: Request,
  context: AppLoadContext,
  redirectTo?: string
): Promise<AuthContext> {
  const authService = new AuthService(context)
  const session = await authService.getSession(request)
  
  try {
    return await authService.getAuthContext(session)
  } catch {
    const url = new URL(request.url)
    const loginUrl = new URL('/login', url.origin)
    
    if (redirectTo) {
      loginUrl.searchParams.set('redirectTo', redirectTo)
    } else {
      loginUrl.searchParams.set('redirectTo', url.pathname + url.search)
    }
    
    throw redirect(loginUrl.toString())
  }
}

// Get authenticated admin user or redirect
export async function requireAdmin(
  request: Request,
  context: AppLoadContext,
  redirectTo?: string
): Promise<AuthContext> {
  const authContext = await requireAuth(request, context, redirectTo)
  
  if (!authContext.isAdmin) {
    throw redirect('/unauthorized')
  }
  
  return authContext
}

// Get optional auth context (doesn't redirect)
export async function getOptionalAuth(
  request: Request,
  context: AppLoadContext
): Promise<AuthContext | null> {
  const authService = new AuthService(context)
  const session = await authService.getSession(request)
  
  return await authService.getOptionalAuthContext(session)
}

// Get session for manual handling
export async function getSession(request: Request, context: AppLoadContext) {
  const authService = new AuthService(context)
  return await authService.getSession(request)
}

// Get auth service instance
export function getAuthService(context: AppLoadContext) {
  return new AuthService(context)
}

// Validate CSRF for forms
export async function validateCSRF(
  request: Request,
  context: AppLoadContext,
  formData?: FormData
): Promise<void> {
  const authService = new AuthService(context)
  
  let csrfToken: string | undefined
  
  if (formData) {
    csrfToken = formData.get('csrf_token') as string
  } else {
    // Try to get from request body if it's JSON
    try {
      const body = await request.clone().json()
      csrfToken = body.csrf_token
    } catch {
      // Not JSON, ignore
    }
  }
  
  if (!authService.validateCSRFToken(request, csrfToken)) {
    throw new Error('Invalid CSRF token')
  }
}

// Create response with session cookie
export async function createAuthResponse(
  request: Request,
  context: AppLoadContext,
  response: Response,
  sessionData?: any
): Promise<Response> {
  const authService = new AuthService(context)
  const session = await authService.getSession(request)
  
  if (sessionData) {
    authService.setSessionData(session, sessionData)
  }
  
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', await authService.commitSession(session))
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Logout and clear session
export async function logout(request: Request, context: AppLoadContext): Promise<Response> {
  const authService = new AuthService(context)
  const session = await authService.getSession(request)
  
  await authService.signOut(session)
  
  return redirect('/login', {
    headers: {
      'Set-Cookie': await authService.destroySession(session),
    },
  })
}
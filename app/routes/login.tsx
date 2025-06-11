import type { Route } from "./+types/login"

// Server-only imports are isolated in the loader/action functions
export async function loader({ request, context }: Route.LoaderArgs) {
  const { redirect } = await import('react-router')
  const { getOptionalAuth, getAuthService } = await import("~/lib/auth-utils.server")
  
  // If already logged in, redirect to home
  const authContext = await getOptionalAuth(request, context)
  if (authContext) {
    return redirect('/')
  }

  // Get CSRF token for the form
  const authService = getAuthService(context)
  const session = await authService.getSession(request)
  const csrfToken = authService.getCSRFToken(session)

  return {
    csrfToken,
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const { redirect } = await import('react-router')
  const { getAuthService } = await import("~/lib/auth-utils.server")
  
  const authService = getAuthService(context)
  const formData = await request.formData()
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const csrfToken = formData.get('csrf_token') as string
  const intent = formData.get('intent') as string

  // Validate CSRF token
  const session = await authService.getSession(request)
  const isValidCSRF = authService.validateCSRFToken(session, csrfToken)
  
  // Debug: Log CSRF validation
  console.log('CSRF Debug:', {
    providedToken: csrfToken?.substring(0, 8) + '...',
    storedToken: session.get('csrfToken')?.substring(0, 8) + '...',
    isValid: isValidCSRF
  })
  
  if (!isValidCSRF) {
    return {
      error: 'Invalid CSRF token - please refresh the page and try again',
      csrfToken: authService.getCSRFToken(session),
    }
  }

  if (!email || !password) {
    return {
      error: 'Email and password are required',
      csrfToken: authService.getCSRFToken(session),
    }
  }

  try {
    let result
    
    if (intent === 'signup') {
      result = await authService.signUp(email, password)
    } else {
      result = await authService.signIn(email, password)
    }

    if (result.error) {
      return {
        error: result.error.message,
        csrfToken: authService.getCSRFToken(session),
      }
    }

    if (result.sessionData) {
      // Set session data and redirect
      authService.setSessionData(session, result.sessionData)
      
      const redirectTo = new URL(request.url).searchParams.get('redirectTo') || '/'
      
      return redirect(redirectTo, {
        headers: {
          'Set-Cookie': await authService.commitSession(session),
        },
      })
    } else {
      // For signup, might need email confirmation
      return {
        success: 'Please check your email to confirm your account',
        csrfToken: authService.getCSRFToken(session),
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Authentication failed',
      csrfToken: authService.getCSRFToken(session),
    }
  }
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { csrfToken } = loaderData
  const error = actionData?.error
  const success = actionData?.success

  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
      <h1>Login / Sign Up</h1>
      
      {error && (
        <div style={{ background: "#ffebee", padding: "1rem", borderRadius: "4px", marginBottom: "1rem", color: "#c62828" }}>
          {error}
        </div>
      )}
      
      {success && (
        <div style={{ background: "#e8f5e8", padding: "1rem", borderRadius: "4px", marginBottom: "1rem", color: "#2e7d32" }}>
          {success}
        </div>
      )}

      <form method="post" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input type="hidden" name="csrf_token" value={actionData?.csrfToken || csrfToken} />
        
        <div>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem" }}>Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </div>

        <div>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem" }}>Password:</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            minLength={6}
            style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="submit"
            name="intent"
            value="login"
            style={{ 
              flex: 1, 
              padding: "0.75rem", 
              backgroundColor: "#1976d2", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Login
          </button>
          
          <button
            type="submit"
            name="intent"
            value="signup"
            style={{ 
              flex: 1, 
              padding: "0.75rem", 
              backgroundColor: "#388e3c", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Sign Up
          </button>
        </div>
      </form>

      <div style={{ marginTop: "2rem", fontSize: "0.9em", color: "#666" }}>
        <p><strong>Test Account:</strong></p>
        <p>You can create a new account or use existing credentials from your archive data.</p>
      </div>
    </div>
  )
}
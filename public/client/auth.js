/**
 * Client-side authentication utilities
 * Handles both localStorage (legacy) and secure cookie authentication
 */

// Authentication state management
export const AuthManager = {
  // Token validation
  isTokenExpired(token) {
    if (!token) return true

    try {
      const parts = token.split('.')
      if (parts.length !== 3) return true

      const payload = JSON.parse(atob(parts[1]))
      const now = Math.floor(Date.now() / 1000)

      return payload.exp && payload.exp < now
    } catch (e) {
      console.warn('Error checking token expiry:', e)
      return true
    }
  },

  // Clear legacy localStorage auth
  clearLegacyAuth() {
    localStorage.removeItem('session')
    localStorage.removeItem('access_token')
  },

  // Check if user has valid session (either localStorage or cookie)
  async hasValidSession() {
    // First check secure cookie auth
    try {
      const response = await fetch('/api/auth/me-secure', {
        credentials: 'include',
      })
      if (response.ok) {
        return true
      }
    } catch (e) {
      // Cookie auth failed, try legacy
    }

    // Fallback to legacy localStorage auth
    const session = localStorage.getItem('session')
    if (!session) return false

    try {
      const sessionData = JSON.parse(session)
      return sessionData.access_token && !this.isTokenExpired(sessionData.access_token)
    } catch (e) {
      this.clearLegacyAuth()
      return false
    }
  },

  // Get current user info
  async getCurrentUser() {
    try {
      // Try secure cookie auth first
      const response = await fetch('/api/auth/me-secure', {
        credentials: 'include',
      })

      if (response.ok) {
        return await response.json()
      }

      // Fallback to legacy auth
      const session = localStorage.getItem('session')
      if (session) {
        const sessionData = JSON.parse(session)
        if (sessionData.access_token && !this.isTokenExpired(sessionData.access_token)) {
          const legacyResponse = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${sessionData.access_token}`,
            },
          })

          if (legacyResponse.ok) {
            return await legacyResponse.json()
          }
        }
      }
    } catch (e) {
      console.error('Error getting current user:', e)
    }

    return null
  },

  // Secure sign in (uses cookies)
  async signInSecure(email, password, csrfToken) {
    try {
      const response = await fetch('/api/auth/signin-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        // Clear any legacy auth
        this.clearLegacyAuth()
        return { success: true, data }
      } else {
        return { success: false, error: data.error }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  },

  // Secure sign out (clears cookies)
  async signOutSecure(csrfToken) {
    try {
      const response = await fetch('/api/auth/signout-secure', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      })

      // Clear legacy auth regardless
      this.clearLegacyAuth()

      return response.ok
    } catch (error) {
      console.error('Sign out error:', error)
      this.clearLegacyAuth()
      return false
    }
  },

  // Legacy authentication fetch wrapper
  async authenticatedFetch(url, options = {}) {
    const session = localStorage.getItem('session')
    if (!session) {
      throw new Error('No session found')
    }

    let sessionData
    try {
      sessionData = JSON.parse(session)
    } catch (e) {
      this.clearLegacyAuth()
      throw new Error('Invalid session data')
    }

    const token = sessionData.access_token
    if (!token || this.isTokenExpired(token)) {
      this.clearLegacyAuth()
      throw new Error('Token expired')
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (response.status === 401 || response.status === 403) {
      this.clearLegacyAuth()
      throw new Error('Authentication failed')
    }

    return response
  },
}

// Header authentication button management
export const HeaderAuth = {
  async updateAuthButton() {
    const authButton = document.getElementById('authButton')
    if (!authButton) return

    try {
      const userData = await AuthManager.getCurrentUser()

      if (userData && userData.user) {
        if (userData.isAdmin) {
          authButton.textContent = 'Admin'
          authButton.style.background = 'var(--error, #ef4444)'
          authButton.href = '/admin'
        } else {
          authButton.textContent = 'Profile'
          authButton.style.background = 'var(--accent, #14b8a6)'
          authButton.href = '/profile'
        }
      } else {
        authButton.textContent = 'Login'
        authButton.style.background = 'var(--primary, #7c3aed)'
        authButton.href = '/login'
      }
    } catch (e) {
      console.error('Error updating auth button:', e)
      authButton.textContent = 'Login'
      authButton.style.background = 'var(--primary, #7c3aed)'
      authButton.href = '/login'
    }
  },

  handleAuthButtonClick() {
    const authButton = document.getElementById('authButton')
    if (!authButton) return false

    const buttonText = authButton.textContent.trim()
    if (buttonText === 'Admin') {
      window.location.href = '/admin'
    } else if (buttonText === 'Profile') {
      window.location.href = '/profile'
    } else {
      window.location.href = '/login'
    }
    return false
  },
}

// Page navigation utilities
export const Navigation = {
  navigate(path) {
    window.location.href = path
    return false
  },

  clearAuthAndRedirect(redirectUrl = '/login') {
    AuthManager.clearLegacyAuth()
    HeaderAuth.updateAuthButton()

    if (window.location.pathname !== '/login') {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `${redirectUrl}?return=${returnUrl}`
    }
  },
}

// Make functions globally available for backward compatibility
window.AuthManager = AuthManager
window.HeaderAuth = HeaderAuth
window.Navigation = Navigation

// Legacy global functions for backward compatibility
window.clearAuthAndRedirect = Navigation.clearAuthAndRedirect
window.navigate = Navigation.navigate
window.isTokenExpired = AuthManager.isTokenExpired
window.authenticatedFetch = AuthManager.authenticatedFetch
window.handleAuthButton = HeaderAuth.handleAuthButtonClick

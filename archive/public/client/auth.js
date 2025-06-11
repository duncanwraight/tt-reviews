/**
 * Secure authentication utilities
 * Uses HTTP-only cookies with CSRF protection
 */

console.log('Loading secure auth module...')

// Authentication Manager
window.AuthManager = {
  // Get CSRF token for secure requests
  async getCSRFToken() {
    try {
      const response = await fetch('/api/auth/csrf-token', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        return data.csrfToken
      }
    } catch (error) {
      console.error('Failed to get CSRF token:', error)
    }
    return null
  },

  // Get current user information
  async getCurrentUser() {
    try {
      const response = await fetch('/api/auth/me-secure', {
        credentials: 'include',
      })
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Failed to get current user:', error)
    }
    return null
  },

  // Secure sign in with cookies
  async signIn(email, password) {
    try {
      const csrfToken = await this.getCSRFToken()
      if (!csrfToken) {
        throw new Error('Unable to get security token')
      }

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
        return { success: true, data }
      } else {
        return { success: false, error: data.error || 'Sign in failed' }
      }
    } catch (error) {
      return { success: false, error: error.message || 'Network error' }
    }
  },

  // Secure sign out
  async signOut() {
    try {
      const csrfToken = await this.getCSRFToken()
      if (!csrfToken) {
        // If we can't get CSRF token, just redirect to clear state
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/auth/signout-secure', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      })

      // Always redirect to login after sign out
      window.location.href = '/login'
    } catch (error) {
      console.error('Sign out error:', error)
      // Redirect anyway to clear state
      window.location.href = '/login'
    }
  },

  // Update the authentication button in header
  async updateAuthButton() {
    const authButton = document.getElementById('authButton')
    if (!authButton) return

    try {
      const userData = await this.getCurrentUser()

      if (userData && userData.user) {
        if (userData.isAdmin) {
          authButton.textContent = 'Admin'
          authButton.style.background = 'var(--error, #ef4444)'
          authButton.href = '/admin'
          authButton.onclick = e => {
            e.preventDefault()
            window.location.href = '/admin'
          }
        } else {
          authButton.textContent = 'Profile'
          authButton.style.background = 'var(--accent, #14b8a6)'
          authButton.href = '/profile'
          authButton.onclick = e => {
            e.preventDefault()
            window.location.href = '/profile'
          }
        }
      } else {
        authButton.textContent = 'Login'
        authButton.style.background = 'var(--primary, #7c3aed)'
        authButton.href = '/login'
        authButton.onclick = e => {
          e.preventDefault()
          window.location.href = '/login'
        }
      }
    } catch (error) {
      console.error('Error updating auth button:', error)
      // Default to login state on error
      authButton.textContent = 'Login'
      authButton.style.background = 'var(--primary, #7c3aed)'
      authButton.href = '/login'
      authButton.onclick = e => {
        e.preventDefault()
        window.location.href = '/login'
      }
    }
  },
}

console.log('AuthManager initialized:', !!window.AuthManager)

// Initialize auth button on script load
document.addEventListener('DOMContentLoaded', () => {
  window.AuthManager.updateAuthButton()
})

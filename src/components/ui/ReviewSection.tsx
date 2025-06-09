import { useState } from 'hono/jsx'
import { Equipment, EquipmentReview } from '../../types/database.js'
import { ReviewForm } from './ReviewForm.js'
import { ReviewList } from './ReviewList.js'

interface ReviewSectionProps {
  equipment: Equipment
  reviews: EquipmentReview[]
  userReview?: EquipmentReview | null
}

export function ReviewSection({ equipment, reviews, userReview }: ReviewSectionProps) {
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [signupData, setSignupData] = useState({ email: '', password: '' })
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check if user is authenticated on component mount
  const checkAuth = () => {
    const token = localStorage.getItem('access_token')
    setIsAuthenticated(!!token)
  }

  // Initialize auth state
  if (typeof window !== 'undefined') {
    checkAuth()
  }

  const handleLogin = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Login failed')
      }

      const result = (await response.json()) as { session: { access_token: string } }
      localStorage.setItem('access_token', result.session.access_token)
      setIsAuthenticated(true)
      setShowLoginForm(false)
      setLoginData({ email: '', password: '' })
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupData),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Signup failed')
      }

      // After successful signup, automatically sign in
      const loginResponse = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupData),
      })

      if (loginResponse.ok) {
        const result = (await loginResponse.json()) as { session: { access_token: string } }
        localStorage.setItem('access_token', result.session.access_token)
        setIsAuthenticated(true)
        setShowLoginForm(false)
        setSignupData({ email: '', password: '' })
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setIsAuthenticated(false)
    setShowReviewForm(false)
  }

  const handleReviewSubmitted = () => {
    setShowReviewForm(false)
    // Optionally refresh the page or update the reviews list
    window.location.reload()
  }

  return (
    <div class="space-y-8">
      {/* Reviews Header & Action Button */}
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">Reviews ({reviews.length})</h2>

        {isAuthenticated ? (
          <div class="space-x-3">
            {userReview ? (
              <div class="text-sm text-gray-600">You've already reviewed this equipment</div>
            ) : (
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {showReviewForm ? 'Cancel Review' : 'Write Review'}
              </button>
            )}
            <button onClick={handleLogout} class="text-gray-600 hover:text-gray-800 text-sm">
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginForm(true)}
            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Login to Review
          </button>
        )}
      </div>

      {/* Login/Signup Modal */}
      {showLoginForm && (
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-semibold">{isSignupMode ? 'Create Account' : 'Sign In'}</h3>
              <button
                onClick={() => setShowLoginForm(false)}
                class="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {authError}
              </div>
            )}

            <form onSubmit={isSignupMode ? handleSignup : handleLogin}>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={isSignupMode ? signupData.email : loginData.email}
                  onInput={e => {
                    const value = (e.target as HTMLInputElement).value
                    if (isSignupMode) {
                      setSignupData(prev => ({ ...prev, email: value }))
                    } else {
                      setLoginData(prev => ({ ...prev, email: value }))
                    }
                  }}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={isSignupMode ? signupData.password : loginData.password}
                  onInput={e => {
                    const value = (e.target as HTMLInputElement).value
                    if (isSignupMode) {
                      setSignupData(prev => ({ ...prev, password: value }))
                    } else {
                      setLoginData(prev => ({ ...prev, password: value }))
                    }
                  }}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? 'Please wait...' : isSignupMode ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div class="mt-4 text-center">
              <button
                onClick={() => {
                  setIsSignupMode(!isSignupMode)
                  setAuthError(null)
                }}
                class="text-blue-600 hover:text-blue-800 text-sm"
              >
                {isSignupMode
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Form */}
      {showReviewForm && (
        <ReviewForm
          equipment={equipment}
          onSubmit={handleReviewSubmitted}
          onCancel={() => setShowReviewForm(false)}
        />
      )}

      {/* Reviews List */}
      <ReviewList reviews={reviews} />
    </div>
  )
}

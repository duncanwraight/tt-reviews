import { Layout } from '../Layout.js'

export function LoginPage() {
  return (
    <Layout
      title="Login | TT Reviews"
      description="Sign in to TT Reviews to submit equipment reviews and access personalized features."
    >
      <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h2 id="auth-title" class="text-3xl font-bold text-gray-900">
              Sign in to your account
            </h2>
            <p id="auth-subtitle" class="mt-2 text-sm text-gray-600">
              Welcome back! Sign in to submit reviews and more
            </p>
          </div>
        </div>

        <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div
              id="error-message"
              class="hidden mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
            ></div>
            <div
              id="success-message"
              class="hidden mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded"
            ></div>

            <form id="auth-form" class="space-y-6">
              <div>
                <label for="email" class="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div class="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div>
                <label for="password" class="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div class="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  id="submit-button"
                  class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sign In
                </button>
              </div>
            </form>

            <div class="mt-6">
              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-gray-300" />
                </div>
                <div class="relative flex justify-center text-sm">
                  <span id="toggle-text" class="px-2 bg-white text-gray-500">
                    Don't have an account?
                  </span>
                </div>
              </div>

              <div class="mt-6">
                <button
                  type="button"
                  id="toggle-mode"
                  class="w-full text-center text-blue-600 hover:text-blue-500 font-medium"
                >
                  Create a new account
                </button>
              </div>
            </div>

            <div class="mt-8 text-center">
              <a href="/" class="text-sm text-gray-600 hover:text-gray-500">
                ← Back to homepage
              </a>
            </div>
          </div>
        </div>

        <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 class="text-sm font-medium text-blue-900 mb-2">Why create an account?</h3>
            <ul class="text-sm text-blue-800 space-y-1">
              <li>• Submit equipment reviews with detailed ratings</li>
              <li>• Share your playing experience and context</li>
              <li>• Help other players make informed decisions</li>
              <li>• Join the community discussion</li>
            </ul>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.addEventListener('DOMContentLoaded', function() {
            console.log('Login page loaded');
            
            let isSignupMode = false;
            
            const authForm = document.getElementById('auth-form');
            const submitButton = document.getElementById('submit-button');
            const toggleButton = document.getElementById('toggle-mode');
            const authTitle = document.getElementById('auth-title');
            const authSubtitle = document.getElementById('auth-subtitle');
            const toggleText = document.getElementById('toggle-text');
            const errorMessage = document.getElementById('error-message');
            const successMessage = document.getElementById('success-message');
            const passwordInput = document.getElementById('password');
            
            // Get CSRF token
            async function getCSRFToken() {
              try {
                const response = await fetch('/api/auth/csrf-token', {
                  credentials: 'include'
                });
                if (response.ok) {
                  const data = await response.json();
                  return data.csrfToken;
                }
              } catch (error) {
                console.error('Failed to get CSRF token:', error);
              }
              return null;
            }
            
            // Secure sign in function
            async function signIn(email, password) {
              try {
                const csrfToken = await getCSRFToken();
                if (!csrfToken) {
                  throw new Error('Unable to get security token');
                }

                const response = await fetch('/api/auth/signin-secure', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                  },
                  credentials: 'include',
                  body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                
                if (response.ok) {
                  return { success: true, data };
                } else {
                  return { success: false, error: data.error || 'Sign in failed' };
                }
              } catch (error) {
                return { success: false, error: error.message || 'Network error' };
              }
            }
            
            function showError(message) {
              errorMessage.textContent = message;
              errorMessage.classList.remove('hidden');
              successMessage.classList.add('hidden');
            }
            
            function showSuccess(message) {
              successMessage.textContent = message;
              successMessage.classList.remove('hidden');
              errorMessage.classList.add('hidden');
            }
            
            function hideMessages() {
              errorMessage.classList.add('hidden');
              successMessage.classList.add('hidden');
            }
            
            function toggleMode() {
              isSignupMode = !isSignupMode;
              
              if (isSignupMode) {
                authTitle.textContent = 'Create your account';
                authSubtitle.textContent = 'Join the community and start reviewing equipment';
                submitButton.textContent = 'Create Account';
                toggleText.textContent = 'Already have an account?';
                toggleButton.textContent = 'Sign in to existing account';
                passwordInput.setAttribute('autocomplete', 'new-password');
              } else {
                authTitle.textContent = 'Sign in to your account';
                authSubtitle.textContent = 'Welcome back! Sign in to submit reviews and more';
                submitButton.textContent = 'Sign In';
                toggleText.textContent = "Don't have an account?";
                toggleButton.textContent = 'Create a new account';
                passwordInput.setAttribute('autocomplete', 'current-password');
              }
              
              hideMessages();
            }
            
            if (toggleButton) {
              toggleButton.addEventListener('click', toggleMode);
            }
            
            if (authForm) {
              authForm.addEventListener('submit', async function(e) {
                console.log('Form submit event fired');
                e.preventDefault();
                console.log('preventDefault called');
                
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                
                console.log('Form data:', { email: email, passwordLength: password.length });
                
                if (!email || !password) {
                  showError('Please fill in all fields');
                  return;
                }
                
                submitButton.disabled = true;
                submitButton.textContent = 'Please wait...';
                hideMessages();
                
                try {
                  if (isSignupMode) {
                    console.log('Attempting signup...');
                    // For signup, use the legacy endpoint then sign in securely
                    const response = await fetch('/api/auth/signup', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, password })
                    });
                    
                    const result = await response.json();
                    console.log('Signup result:', result);
                    
                    if (!response.ok) {
                      throw new Error(result.error || 'Signup failed');
                    }
                    
                    // After successful signup, sign in securely
                    const signInResult = await signIn(email, password);
                    console.log('Post-signup signin result:', signInResult);
                    if (signInResult.success) {
                      showSuccess('Account created successfully! Redirecting...');
                    } else {
                      throw new Error(signInResult.error || 'Failed to sign in after signup');
                    }
                  } else {
                    console.log('Attempting signin...');
                    // Use secure sign in
                    const result = await signIn(email, password);
                    console.log('Signin result:', result);
                    if (result.success) {
                      showSuccess('Login successful! Redirecting...');
                    } else {
                      throw new Error(result.error || 'Authentication failed');
                    }
                  }
                  
                  console.log('Auth successful, redirecting in 1.5s...');
                  setTimeout(() => {
                    const returnUrl = new URLSearchParams(window.location.search).get('return') || '/';
                    console.log('Redirecting to:', returnUrl);
                    window.location.href = returnUrl;
                  }, 1500);
                  
                } catch (error) {
                  console.error('Auth error:', error);
                  showError(error.message);
                } finally {
                  submitButton.disabled = false;
                  submitButton.textContent = isSignupMode ? 'Create Account' : 'Sign In';
                }
              });
              
              console.log('Form event listener attached');
            } else {
              console.error('Auth form not found!');
            }
          });
        `,
        }}
      />
    </Layout>
  )
}
/**
 * Form handling utilities
 * Provides consistent form submission patterns with CSRF protection
 */

console.log('Forms module loaded')

window.FormHandler = {
  // Get CSRF token from cookie
  getCSRFToken() {
    const cookies = document.cookie.split(';')
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      if (name === 'csrf_token') {
        return decodeURIComponent(value)
      }
    }
    return null
  },

  // Submit form with CSRF protection
  async submitFormSecure(formElement, options = {}) {
    const formData = new FormData(formElement)
    const csrfToken = this.getCSRFToken()

    if (csrfToken) {
      formData.append('csrf_token', csrfToken)
    }

    const defaultOptions = {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    }

    try {
      const response = await fetch(options.url || formElement.action, {
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers,
        },
        body: formData,
      })

      const data = await response.json()

      return {
        success: response.ok,
        data,
        status: response.status,
      }
    } catch (error) {
      return {
        success: false,
        error: 'Network error',
        status: 0,
      }
    }
  },

  // Show form validation errors
  showFormError(formElement, message) {
    let errorDiv = formElement.querySelector('.form-error')
    if (!errorDiv) {
      errorDiv = document.createElement('div')
      errorDiv.className =
        'form-error bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4'
      formElement.insertBefore(errorDiv, formElement.firstChild)
    }
    errorDiv.textContent = message
    errorDiv.style.display = 'block'
  },

  // Show form success message
  showFormSuccess(formElement, message) {
    let successDiv = formElement.querySelector('.form-success')
    if (!successDiv) {
      successDiv = document.createElement('div')
      successDiv.className =
        'form-success bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4'
      formElement.insertBefore(successDiv, formElement.firstChild)
    }
    successDiv.textContent = message
    successDiv.style.display = 'block'
  },

  // Hide form messages
  hideFormMessages(formElement) {
    const errorDiv = formElement.querySelector('.form-error')
    const successDiv = formElement.querySelector('.form-success')

    if (errorDiv) errorDiv.style.display = 'none'
    if (successDiv) successDiv.style.display = 'none'
  },
}

// Search functionality
window.SearchHandler = {
  init() {
    const searchInputs = document.querySelectorAll('.search-input')
    const searchButtons = document.querySelectorAll('.search-button')

    searchInputs.forEach(input => {
      input.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          this.performSearch(input)
        }
      })

      input.addEventListener('focus', function () {
        this.classList.add('ring-2', 'ring-purple-500', 'border-transparent')
      })

      input.addEventListener('blur', function () {
        this.classList.remove('ring-2', 'ring-purple-500', 'border-transparent')
      })
    })

    searchButtons.forEach(button => {
      button.addEventListener('click', e => {
        e.preventDefault()
        const input =
          button.closest('form')?.querySelector('.search-input') ||
          document.getElementById('main-search') ||
          document.querySelector('.search-input')
        if (input) {
          this.performSearch(input)
        }
      })
    })
  },

  performSearch(inputElement = null) {
    const searchInput =
      inputElement ||
      document.getElementById('main-search') ||
      document.querySelector('.search-input')

    if (searchInput && searchInput.value.trim()) {
      const query = encodeURIComponent(searchInput.value.trim())
      window.location.href = '/search?q=' + query
    }
  },
}

// Tab switching functionality
window.TabHandler = {
  switchTab(tabName) {
    // Remove active state from all tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active', 'border-purple-600', 'text-purple-600')
      btn.classList.add('border-transparent', 'text-gray-700')
    })

    // Hide all tab content
    document.querySelectorAll('[id$="-content"]').forEach(content => {
      content.style.display = 'none'
    })

    // Activate selected tab and show content
    const button = document.querySelector(`[onclick="switchTab('${tabName}')"]`)
    const content = document.getElementById(`${tabName}-content`)

    if (button && content) {
      button.classList.add('active', 'border-purple-600', 'text-purple-600')
      button.classList.remove('border-transparent', 'text-gray-700')
      content.style.display = 'block'
    }
  },
}

// Player form utilities
window.PlayerFormHandler = {
  updateRepresentsDefault() {
    const birthCountry =
      document.getElementById('birth-country') || document.getElementById('edit-birth-country')
    const represents =
      document.getElementById('represents') || document.getElementById('edit-represents')

    if (birthCountry && represents && birthCountry.value) {
      if (!represents.value || represents.value === '') {
        const matchingOption = represents.querySelector(`option[value="${birthCountry.value}"]`)
        if (matchingOption) {
          represents.value = birthCountry.value
        }
      }
    }
  },
}

// Confirm utilities are globally available
console.log('Forms objects assigned to window:', {
  FormHandler: !!window.FormHandler,
  SearchHandler: !!window.SearchHandler,
  TabHandler: !!window.TabHandler,
})
// Legacy global functions for backward compatibility
window.switchTab = window.TabHandler.switchTab
window.updateRepresentsDefault = window.PlayerFormHandler.updateRepresentsDefault

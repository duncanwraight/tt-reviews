// Client-side progressive enhancement script
export function ClientScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
        // Navigation helper
        function navigate(path) {
          window.location.href = path;
          return false;
        }
        
        // Search functionality
        document.addEventListener('DOMContentLoaded', function() {
          // Enhanced search functionality
          const searchInputs = document.querySelectorAll('.search-input');
          const searchButtons = document.querySelectorAll('.search-button');
          
          function performSearch() {
            const searchInput = document.getElementById('main-search') || document.querySelector('.search-input');
            if (searchInput && searchInput.value.trim()) {
              const query = encodeURIComponent(searchInput.value.trim());
              window.location.href = '/search?q=' + query;
            }
          }
          
          // Handle search input key events
          searchInputs.forEach(input => {
            input.addEventListener('keypress', function(e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
              }
            });
            
            // Add focus styles
            input.addEventListener('focus', function() {
              this.classList.add('ring-2', 'ring-purple-500', 'border-transparent');
            });
            
            input.addEventListener('blur', function() {
              this.classList.remove('ring-2', 'ring-purple-500', 'border-transparent');
            });
          });
          
          // Handle search button clicks
          searchButtons.forEach(button => {
            button.addEventListener('click', function(e) {
              e.preventDefault();
              performSearch();
            });
          });
          
          // Tab switching functionality for player pages
          window.switchTab = function(tabName) {
            // Remove active state from all tabs
            document.querySelectorAll('.tab-button').forEach(btn => {
              btn.classList.remove('active', 'border-purple-600', 'text-purple-600');
              btn.classList.add('border-transparent', 'text-gray-700');
            });
            
            // Hide all tab content
            document.querySelectorAll('[id$="-content"]').forEach(content => {
              content.style.display = 'none';
            });
            
            // Activate selected tab and show content
            const button = document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`);
            const content = document.getElementById(\`\${tabName}-content\`);
            
            if (button && content) {
              button.classList.add('active', 'border-purple-600', 'text-purple-600');
              button.classList.remove('border-transparent', 'text-gray-700');
              content.style.display = 'block';
            }
          };
          
          // Authentication state management
          async function updateAuthButton() {
            console.log('Updating auth button...');
            const authButton = document.getElementById('authButton');
            const session = localStorage.getItem('session');
            
            console.log('Auth button element:', authButton ? 'found' : 'not found');
            console.log('Session in localStorage:', session ? 'present' : 'missing');
            
            if (authButton) {
              if (session) {
                try {
                  const sessionData = JSON.parse(session);
                  console.log('Parsed session data:', sessionData);
                  
                  if (sessionData.access_token) {
                    console.log('Access token found, checking admin status...');
                    // Check if user is admin
                    const isAdmin = await checkAdminStatus(sessionData.access_token);
                    
                    console.log('Is admin:', isAdmin);
                    
                    if (isAdmin) {
                      authButton.textContent = 'Admin';
                      authButton.style.background = 'var(--error, #ef4444)';
                      authButton.href = '/admin';
                    } else {
                      authButton.textContent = 'Profile';
                      authButton.style.background = 'var(--accent, #14b8a6)';
                      authButton.href = '/profile';
                    }
                    console.log('Auth button updated to:', authButton.textContent);
                    return;
                  } else {
                    console.log('No access_token in session data');
                  }
                } catch (e) {
                  console.warn('Invalid session data:', e);
                }
              }
              
              // Default state
              console.log('Setting auth button to default login state');
              authButton.textContent = 'Login';
              authButton.style.background = 'var(--primary, #7c3aed)';
              authButton.href = '/login';
            }
          }
          
          // Check admin status via API
          async function checkAdminStatus(token) {
            try {
              console.log('Checking admin status with token:', token ? 'present' : 'missing');
              const response = await fetch('/api/auth/me', {
                headers: {
                  'Authorization': \`Bearer \${token}\`
                }
              });
              
              console.log('Admin check response status:', response.status);
              
              if (response.ok) {
                const userData = await response.json();
                console.log('User data:', userData);
                return userData.isAdmin || false;
              } else {
                console.warn('Admin check failed with status:', response.status);
                const errorText = await response.text();
                console.warn('Error response:', errorText);
              }
            } catch (e) {
              console.warn('Failed to check admin status:', e);
            }
            return false;
          }
          
          // Handle auth button clicks
          window.handleAuthButton = function() {
            const authButton = document.getElementById('authButton');
            const session = localStorage.getItem('session');
            
            try {
              if (session && authButton) {
                const sessionData = JSON.parse(session);
                if (sessionData.access_token) {
                  // Navigate based on button text
                  const buttonText = authButton.textContent.trim();
                  if (buttonText === 'Admin') {
                    navigate('/admin');
                  } else if (buttonText === 'Profile') {
                    navigate('/profile');
                  } else {
                    navigate('/login');
                  }
                  return false;
                }
              }
            } catch (e) {
              console.warn('Invalid session data');
            }
            
            navigate('/login');
            return false;
          };
          
          // Update auth button on page load
          updateAuthButton();
          
          // Filter functionality for search and equipment pages
          const filterSelects = document.querySelectorAll('select');
          filterSelects.forEach(select => {
            select.addEventListener('change', function() {
              // TODO: Implement filter functionality
              console.log('Filter changed:', this.value);
            });
          });
          
          // Rating interaction (future enhancement)
          const ratingStars = document.querySelectorAll('.rating');
          ratingStars.forEach(rating => {
            rating.addEventListener('click', function() {
              // TODO: Implement rating interaction
              console.log('Rating clicked');
            });
          });
          
          // Smooth scroll for anchor links
          document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
              e.preventDefault();
              const target = document.querySelector(this.getAttribute('href'));
              if (target) {
                target.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            });
          });
          
          // Mobile menu toggle (future enhancement)
          const mobileToggle = document.querySelector('.mobile-menu-toggle');
          if (mobileToggle) {
            mobileToggle.addEventListener('click', function() {
              const navMenu = document.querySelector('.nav-menu');
              if (navMenu) {
                navMenu.classList.toggle('hidden');
              }
            });
          }
          
          // Image lazy loading fallback for older browsers
          if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
              entries.forEach(entry => {
                if (entry.isIntersecting) {
                  const img = entry.target;
                  if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                  }
                }
              });
            });
            
            document.querySelectorAll('img[data-src]').forEach(img => {
              imageObserver.observe(img);
            });
          }
          
          // Performance monitoring
          if ('performance' in window && 'measure' in performance) {
            window.addEventListener('load', function() {
              setTimeout(() => {
                try {
                  const navigation = performance.getEntriesByType('navigation')[0];
                  const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
                  console.log('Page load time:', loadTime, 'ms');
                } catch (e) {
                  // Ignore performance monitoring errors
                }
              }, 0);
            });
          }
        });
      `,
      }}
    />
  )
}

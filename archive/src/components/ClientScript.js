import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
// Simplified client-side progressive enhancement script
export function ClientScript() {
    return (_jsxs(_Fragment, { children: [_jsx("script", { src: "/client/auth.js" }), _jsx("script", { src: "/client/forms.js" }), _jsx("script", { dangerouslySetInnerHTML: {
                    __html: `
          // Initialize client-side functionality
          document.addEventListener('DOMContentLoaded', function() {
            // Initialize search functionality if available
            if (window.SearchHandler && window.SearchHandler.init) {
              window.SearchHandler.init();
            }
            
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
            
            // Mobile menu toggle
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
          });
        `,
                } })] }));
}

// Simplified client-side progressive enhancement script
export function ClientScript() {
  return (
    <>
      {/* Import modular JavaScript */}
      <script src="/client/auth.js" />
      <script src="/client/forms.js" />

      <script
        dangerouslySetInnerHTML={{
          __html: `
          // Initialize client-side functionality
          document.addEventListener('DOMContentLoaded', function() {
            // Initialize search functionality
            SearchHandler.init();
            
            // Update auth button on page load
            HeaderAuth.updateAuthButton();
            
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
        }}
      />
    </>
  )
}

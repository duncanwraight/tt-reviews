import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { EquipmentSubmissionForm } from '../ui/EquipmentSubmissionForm'
import { getModalScript } from '../ui/Modal'

interface EquipmentSubmitPageProps {
  baseUrl: string
  user?: { email?: string; id: string }
  children?: any
}

export const EquipmentSubmitPage: FC<EquipmentSubmitPageProps> = ({ baseUrl, user, children }) => {
  return (
    <Layout
      title="Submit New Equipment | TT Reviews"
      description="Submit new table tennis equipment to the database. Help grow our comprehensive equipment review platform."
    >
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">Submit New Equipment</h1>
            <p class="text-lg text-gray-600">
              Help expand our equipment database by submitting new table tennis equipment.
            </p>
          </div>

          <EquipmentSubmissionForm baseUrl={baseUrl} />
          {children}
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: getModalScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addEquipmentFormScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addAuthCheckScript() }} />
    </Layout>
  )
}

// Auth check script (same pattern as PlayerSubmitPage)
function addAuthCheckScript() {
  return `
    document.addEventListener('DOMContentLoaded', function() {
      const session = localStorage.getItem('session');
      let token = null;
      
      if (session) {
        try {
          const sessionData = JSON.parse(session);
          token = sessionData.access_token;
          
          // Check if token is expired
          if (token && window.isTokenExpired && window.isTokenExpired(token)) {
            console.warn('Token is expired, clearing auth state');
            window.clearAuthAndRedirect();
            return;
          }
        } catch (e) {
          console.warn('Invalid session data');
          window.clearAuthAndRedirect();
          return;
        }
      }
      
      if (!token) {
        // Redirect to login with return URL
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = '/login?return=' + encodeURIComponent(currentPath);
      }
    });
  `
}

// Equipment form script (similar pattern to PlayerSubmitPage)
function addEquipmentFormScript() {
  return `
    async function handleEquipmentSubmit(event) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      // Basic validation
      if (!formData.get('name') || !formData.get('manufacturer') || !formData.get('category')) {
        window.showErrorModal('Validation Error', 'Please fill in all required fields (name, manufacturer, and category).');
        return;
      }
      
      try {
        const response = await window.authenticatedFetch('/api/equipment-submissions/submit', {
          method: 'POST',
          body: formData
        });
        
        if (response.success === true) {
          window.showSuccessModal('Equipment Submitted!', 'Your equipment submission has been received and will be reviewed by our moderation team.');
          form.reset();
          
          // Redirect to equipment list after a delay
          setTimeout(() => {
            window.location.href = '/equipment';
          }, 2000);
        } else if (response.success === false) {
          window.showErrorModal('Submission Failed', response.error || 'Failed to submit equipment. Please try again.');
        }
      } catch (error) {
        console.error('Equipment submission error:', error);
        window.showErrorModal('Network Error', 'Unable to submit equipment. Please check your connection and try again.');
      }
    }
    
    // Add form handler when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('equipment-form');
      if (form) {
        form.addEventListener('submit', handleEquipmentSubmit);
      }
    });
  `
}

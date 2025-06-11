import { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { PlayerForm } from '../ui/PlayerForm'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { getModalScript } from '../ui/Modal'

export const PlayerSubmitPage: FC = () => {
  const breadcrumbs = generateBreadcrumbs('/players/submit')

  return (
    <Layout
      title="Submit New Player - TT Reviews"
      description="Submit a new professional table tennis player profile with their equipment setup and details."
    >
      <Breadcrumb items={breadcrumbs} />

      <section class="py-8">
        <div class="main-container">
          <div class="page-header mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">Submit New Player</h1>
            <p class="text-lg text-gray-600 max-w-3xl">
              Help us grow our database by submitting a new professional table tennis player.
              Include their current equipment setup and any relevant details you know about their
              playing style and achievements.
            </p>
          </div>

          <div class="submission-guidelines bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 class="text-lg font-semibold text-blue-900 mb-3">Submission Guidelines</h3>
            <ul class="space-y-2 text-blue-800">
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Only submit professional or well-known competitive players
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Equipment information should be verified with reliable sources
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Include source URLs when possible (interviews, videos, official websites)
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                All submissions will be reviewed before being published
              </li>
            </ul>
          </div>

          <PlayerForm />
        </div>
      </section>

      <script dangerouslySetInnerHTML={{ __html: getModalScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addPlayerFormScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addAuthCheckScript() }} />
    </Layout>
  )
}

// Add player form script functionality
function addPlayerFormScript() {
  return `
    async function handlePlayerSubmit(event, mode) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      // Build player data
      const playerData = {
        name: formData.get('name'),
        highest_rating: formData.get('highest_rating') || null,
        active_years: formData.get('active_years') || null,
        active: formData.get('active') === 'true',
        playing_style: formData.get('playing_style') || null,
        birth_country: formData.get('birth_country') || null,
        represents: formData.get('represents') || null
      };
      
      // Build equipment setup data if provided
      const equipmentSetup = {};
      if (formData.get('blade_name')) equipmentSetup.blade_name = formData.get('blade_name');
      if (formData.get('forehand_rubber_name')) {
        equipmentSetup.forehand_rubber_name = formData.get('forehand_rubber_name');
        equipmentSetup.forehand_thickness = formData.get('forehand_thickness') || null;
        equipmentSetup.forehand_color = formData.get('forehand_color') || null;
      }
      if (formData.get('backhand_rubber_name')) {
        equipmentSetup.backhand_rubber_name = formData.get('backhand_rubber_name');
        equipmentSetup.backhand_thickness = formData.get('backhand_thickness') || null;
        equipmentSetup.backhand_color = formData.get('backhand_color') || null;
      }
      if (formData.get('year')) equipmentSetup.year = parseInt(formData.get('year'));
      if (formData.get('source_type')) equipmentSetup.source_type = formData.get('source_type');
      if (formData.get('source_url')) equipmentSetup.source_url = formData.get('source_url');
      
      try {
        const endpoint = mode === 'update' ? '/api/players/update' : '/api/players/submit';
        const response = await window.authenticatedFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            player: playerData,
            equipmentSetup: Object.keys(equipmentSetup).length > 0 ? equipmentSetup : null
          })
        });
        
        const result = await response.json();
        
        if (result.success || result.id) {
          // Show success message and redirect
          const successMessage = mode === 'update' ? 'Player updated successfully!' : 'Player submitted successfully!';
          const redirectUrl = result.slug || result.data?.slug ? '/players/' + (result.slug || result.data.slug) : '/players';
          showSuccessModal('Success!', successMessage, 'window.location.href = "' + redirectUrl + '"');
        } else {
          showErrorModal('Submission Failed', result.message || 'Unknown error occurred while submitting player data');
        }
      } catch (error) {
        console.error('Submit error:', error);
        showErrorModal('Network Error', 'An error occurred while submitting the player data. Please check your connection and try again.');
      }
    }
  `
}

// Add authentication check to redirect if not logged in
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

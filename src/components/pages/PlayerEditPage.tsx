import { PlayerEditPageProps } from '../../types/components'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { getModalScript } from '../ui/Modal'

export function PlayerEditPage({ player }: PlayerEditPageProps) {
  const breadcrumbs = generateBreadcrumbs(`/players/${player.slug}/edit`)

  return (
    <Layout
      title={`Edit ${player.name} - TT Reviews`}
      description={`Update ${player.name}'s profile information and equipment details.`}
    >
      <Breadcrumb items={breadcrumbs} />

      <section class="py-8">
        <div class="main-container">
          <div class="page-header mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">Edit Player: {player.name}</h1>
            <p class="text-lg text-gray-600 max-w-3xl">
              Update {player.name}'s profile information or add a new equipment setup. All changes
              will be reviewed before being published.
            </p>
          </div>

          <div class="current-info bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
            <h3 class="text-lg font-semibold text-gray-900 mb-3">Current Information</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span class="font-medium text-gray-700">Name:</span>
                <span class="ml-2 text-gray-900">{player.name}</span>
              </div>
              {player.highest_rating && (
                <div>
                  <span class="font-medium text-gray-700">Highest Rating:</span>
                  <span class="ml-2 text-gray-900">{player.highest_rating}</span>
                </div>
              )}
              {player.active_years && (
                <div>
                  <span class="font-medium text-gray-700">Active Years:</span>
                  <span class="ml-2 text-gray-900">{player.active_years}</span>
                </div>
              )}
              <div>
                <span class="font-medium text-gray-700">Status:</span>
                <span class="ml-2 text-gray-900">{player.active ? 'Active' : 'Retired'}</span>
              </div>
            </div>
          </div>

          <div class="update-guidelines bg-amber-50 border border-amber-200 rounded-lg p-6 mb-8">
            <h3 class="text-lg font-semibold text-amber-900 mb-3">Update Guidelines</h3>
            <ul class="space-y-2 text-amber-800">
              <li class="flex items-start">
                <span class="text-amber-600 mr-2">•</span>
                Equipment updates should reflect recent changes in the player's setup
              </li>
              <li class="flex items-start">
                <span class="text-amber-600 mr-2">•</span>
                Always provide reliable sources for equipment information
              </li>
              <li class="flex items-start">
                <span class="text-amber-600 mr-2">•</span>
                Profile updates should be based on official information
              </li>
              <li class="flex items-start">
                <span class="text-amber-600 mr-2">•</span>
                All changes will be reviewed before being published
              </li>
            </ul>
          </div>

          <div class="edit-sections space-y-12">
            {/* Basic Information Edit */}
            <div class="basic-info-section">
              <h2 class="text-2xl font-bold text-gray-900 mb-6">Edit Basic Information</h2>
              <div class="moderation-notice bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p class="text-amber-800 text-sm">
                  <strong>Moderation Required:</strong> All profile changes will be reviewed before
                  being published.
                </p>
              </div>
              <BasicInfoForm player={player} />
            </div>

            {/* Equipment Setup Section */}
            <div id="add-equipment" class="add-equipment-section pt-8 border-t border-gray-200">
              <h2 class="text-2xl font-bold text-gray-900 mb-4">Add New Equipment Setup</h2>
              <p class="text-gray-600 mb-6">
                Submit a new equipment setup for {player.name} if they've changed their equipment
                recently. Equipment updates are also reviewed before being published.
              </p>
              <EquipmentSetupForm playerSlug={player.slug} />
            </div>
          </div>
        </div>
      </section>

      <script dangerouslySetInnerHTML={{ __html: getModalScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addBasicInfoSubmit() }} />
      <script dangerouslySetInnerHTML={{ __html: addPlayerFormScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addEquipmentSetupScript() }} />
      <script dangerouslySetInnerHTML={{ __html: addAuthCheckScript() }} />
    </Layout>
  )
}

// Basic information form component
function BasicInfoForm({ player }: { player: any }) {
  return (
    <div class="basic-info-form bg-white rounded-lg border border-gray-200 p-6">
      <form id="basic-info-form" onsubmit={`handleBasicInfoSubmit(event, '${player.slug}')`}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="edit-player-name">
              Player Name *
            </label>
            <input
              type="text"
              id="edit-player-name"
              name="name"
              value={player.name}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="edit-highest-rating">
              Highest Rating
            </label>
            <input
              type="text"
              id="edit-highest-rating"
              name="highest_rating"
              value={player.highest_rating || ''}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., 3000+ ITTF Rating"
            />
          </div>

          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="edit-active-years">
              Active Years
            </label>
            <input
              type="text"
              id="edit-active-years"
              name="active_years"
              value={player.active_years || ''}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., 2005-2024, 2010-present"
            />
          </div>

          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="edit-active-status">
              Status
            </label>
            <select
              id="edit-active-status"
              name="active"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="true" selected={player.active !== false}>
                Active
              </option>
              <option value="false" selected={player.active === false}>
                Retired
              </option>
            </select>
          </div>
        </div>

        <div class="form-actions flex justify-end mt-6">
          <button
            type="submit"
            class="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            Submit Changes for Review
          </button>
        </div>
      </form>
    </div>
  )
}

// Separate form component for adding equipment setups
function EquipmentSetupForm({ playerSlug }: { playerSlug: string }) {
  return (
    <div class="equipment-setup-form bg-white rounded-lg border border-gray-200 p-6">
      <form onsubmit={`handleEquipmentSetupSubmit(event, '${playerSlug}')`}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Blade Selection */}
          <div class="form-group col-span-full">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-blade">
              Blade
            </label>
            <div class="equipment-search-container">
              <input
                type="text"
                id="new-blade"
                name="blade_search"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Search for blade"
                oninput="searchEquipment('new_blade', this.value)"
              />
              <div
                id="new-blade-results"
                class="equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto"
              ></div>
              <input type="hidden" name="blade_id" id="new-blade-id" />
            </div>
          </div>

          {/* Forehand Rubber */}
          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-forehand-rubber">
              Forehand Rubber
            </label>
            <div class="equipment-search-container">
              <input
                type="text"
                id="new-forehand-rubber"
                name="forehand_rubber_search"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Search for rubber"
                oninput="searchEquipment('new_forehand_rubber', this.value)"
              />
              <div
                id="new-forehand-rubber-results"
                class="equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto"
              ></div>
              <input type="hidden" name="forehand_rubber_id" id="new-forehand-rubber-id" />
            </div>

            <div class="rubber-details grid grid-cols-2 gap-2 mt-2">
              <select
                name="forehand_thickness"
                class="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="">Thickness</option>
                <option value="1.5mm">1.5mm</option>
                <option value="1.8mm">1.8mm</option>
                <option value="2.0mm">2.0mm</option>
                <option value="max">Max</option>
              </select>
              <select
                name="forehand_color"
                class="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="">Color</option>
                <option value="red">Red</option>
                <option value="black">Black</option>
              </select>
            </div>
          </div>

          {/* Backhand Rubber */}
          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-backhand-rubber">
              Backhand Rubber
            </label>
            <div class="equipment-search-container">
              <input
                type="text"
                id="new-backhand-rubber"
                name="backhand_rubber_search"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Search for rubber"
                oninput="searchEquipment('new_backhand_rubber', this.value)"
              />
              <div
                id="new-backhand-rubber-results"
                class="equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto"
              ></div>
              <input type="hidden" name="backhand_rubber_id" id="new-backhand-rubber-id" />
            </div>

            <div class="rubber-details grid grid-cols-2 gap-2 mt-2">
              <select
                name="backhand_thickness"
                class="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="">Thickness</option>
                <option value="1.5mm">1.5mm</option>
                <option value="1.8mm">1.8mm</option>
                <option value="2.0mm">2.0mm</option>
                <option value="max">Max</option>
              </select>
              <select
                name="backhand_color"
                class="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="">Color</option>
                <option value="red">Red</option>
                <option value="black">Black</option>
              </select>
            </div>
          </div>

          {/* Setup Year and Source */}
          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-setup-year">
              Year *
            </label>
            <input
              type="number"
              id="new-setup-year"
              name="year"
              min="2000"
              max="2025"
              value={new Date().getFullYear()}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div class="form-group">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-source-type">
              Source Type
            </label>
            <select
              id="new-source-type"
              name="source_type"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Select source type</option>
              <option value="interview">Interview</option>
              <option value="video">Video</option>
              <option value="tournament_footage">Tournament Footage</option>
              <option value="official_website">Official Website</option>
            </select>
          </div>

          <div class="form-group col-span-full">
            <label class="block text-sm font-medium text-gray-700 mb-2" for="new-source-url">
              Source URL (optional)
            </label>
            <input
              type="url"
              id="new-source-url"
              name="source_url"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>
        </div>

        <div class="form-actions flex justify-end mt-6">
          <button
            type="submit"
            class="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            Add Equipment Setup
          </button>
        </div>
      </form>
    </div>
  )
}

// Add basic info submission handler
function addBasicInfoSubmit() {
  return `
    async function handleBasicInfoSubmit(event, playerSlug) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      const playerData = {
        name: formData.get('name'),
        highest_rating: formData.get('highest_rating') || null,
        active_years: formData.get('active_years') || null,
        active: formData.get('active') === 'true'
      };
      
      try {
        const session = localStorage.getItem('session');
        let token = null;
        if (session) {
          try {
            const sessionData = JSON.parse(session);
            token = sessionData.access_token;
          } catch (e) {
            console.warn('Invalid session data');
          }
        }
        if (!token) {
          showErrorModal('Authentication Required', 'Please log in to edit player information');
          return;
        }
        
        const response = await fetch('/api/players/' + playerSlug + '/edit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(playerData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          showSuccessModal('Submitted for Review', 'Your changes have been submitted for moderation review. They will be published once approved.');
        } else {
          showErrorModal('Submission Failed', result.message || 'Unknown error occurred');
        }
      } catch (error) {
        console.error('Submit error:', error);
        showErrorModal('Network Error', 'An error occurred while submitting the changes. Please check your connection and try again.');
      }
    }
  `
}

// Add equipment setup submission handler
function addEquipmentSetupScript() {
  return `
    async function handleEquipmentSetupSubmit(event, playerSlug) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      // Build equipment setup data
      const equipmentSetup = {};
      if (formData.get('blade_id')) equipmentSetup.blade_id = formData.get('blade_id');
      if (formData.get('forehand_rubber_id')) {
        equipmentSetup.forehand_rubber_id = formData.get('forehand_rubber_id');
        equipmentSetup.forehand_thickness = formData.get('forehand_thickness') || null;
        equipmentSetup.forehand_color = formData.get('forehand_color') || null;
      }
      if (formData.get('backhand_rubber_id')) {
        equipmentSetup.backhand_rubber_id = formData.get('backhand_rubber_id');
        equipmentSetup.backhand_thickness = formData.get('backhand_thickness') || null;
        equipmentSetup.backhand_color = formData.get('backhand_color') || null;
      }
      if (formData.get('year')) equipmentSetup.year = parseInt(formData.get('year'));
      if (formData.get('source_type')) equipmentSetup.source_type = formData.get('source_type');
      if (formData.get('source_url')) equipmentSetup.source_url = formData.get('source_url');
      
      if (!equipmentSetup.year) {
        showErrorModal('Missing Information', 'Year is required for equipment setups');
        return;
      }
      
      try {
        const session = localStorage.getItem('session');
        let token = null;
        if (session) {
          try {
            const sessionData = JSON.parse(session);
            token = sessionData.access_token;
          } catch (e) {
            console.warn('Invalid session data');
          }
        }
        if (!token) {
          showErrorModal('Authentication Required', 'Please log in to add equipment setups');
          return;
        }
        
        const response = await fetch('/api/players/' + playerSlug + '/equipment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(equipmentSetup)
        });
        
        const result = await response.json();
        
        if (result.success) {
          showSuccessModal('Equipment Added', 'Equipment setup added successfully!', 
            'form.reset(); document.getElementById("new-blade-id").value = ""; document.getElementById("new-forehand-rubber-id").value = ""; document.getElementById("new-backhand-rubber-id").value = "";');
        } else {
          showErrorModal('Addition Failed', result.message || 'Unknown error occurred');
        }
      } catch (error) {
        console.error('Submit error:', error);
        showErrorModal('Network Error', 'An error occurred while adding the equipment setup. Please check your connection and try again.');
      }
    }
  `
}

// Add player form script functionality (same as in PlayerSubmitPage)
function addPlayerFormScript() {
  return `
    let searchTimeout;
    
    async function searchEquipment(type, query) {
      clearTimeout(searchTimeout);
      
      if (query.length < 2) {
        hideResults(type);
        return;
      }
      
      searchTimeout = setTimeout(async () => {
        try {
          const response = await fetch('/api/equipment/search?q=' + encodeURIComponent(query));
          const data = await response.json();
          
          if (data.success) {
            showResults(type, data.data);
          }
        } catch (error) {
          console.error('Equipment search error:', error);
        }
      }, 300);
    }
    
    function showResults(type, results) {
      const resultsDiv = document.getElementById(type.replace('_', '-') + '-results');
      const categoryFilter = type === 'blade' ? 'blade' : 'rubber';
      const filtered = results.filter(item => item.category === categoryFilter);
      
      if (filtered.length === 0) {
        hideResults(type);
        return;
      }
      
      resultsDiv.innerHTML = filtered.map(item => 
        '<div class="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" onclick="selectEquipment(' + 
        JSON.stringify(type) + ', ' + JSON.stringify(item.id) + ', ' + JSON.stringify(item.name) + ')">' +
        '<div class="font-medium text-sm">' + item.name + '</div>' +
        '<div class="text-xs text-gray-500">' + item.manufacturer + '</div>' +
        '</div>'
      ).join('');
      
      resultsDiv.classList.remove('hidden');
    }
    
    function hideResults(type) {
      const resultsDiv = document.getElementById(type.replace('_', '-') + '-results');
      resultsDiv.classList.add('hidden');
    }
    
    function selectEquipment(type, id, name) {
      const input = document.getElementById(type.replace('_', '-'));
      const hiddenInput = document.getElementById(type.replace('_', '-') + '-id');
      
      input.value = name;
      hiddenInput.value = id;
      hideResults(type);
    }
    
    async function handlePlayerSubmit(event, mode) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      // Build player data
      const playerData = {
        name: formData.get('name'),
        highest_rating: formData.get('highest_rating') || null,
        active_years: formData.get('active_years') || null,
        active: formData.get('active') === 'true'
      };
      
      // Build equipment setup data if provided
      const equipmentSetup = {};
      if (formData.get('blade_id')) equipmentSetup.blade_id = formData.get('blade_id');
      if (formData.get('forehand_rubber_id')) {
        equipmentSetup.forehand_rubber_id = formData.get('forehand_rubber_id');
        equipmentSetup.forehand_thickness = formData.get('forehand_thickness') || null;
        equipmentSetup.forehand_color = formData.get('forehand_color') || null;
      }
      if (formData.get('backhand_rubber_id')) {
        equipmentSetup.backhand_rubber_id = formData.get('backhand_rubber_id');
        equipmentSetup.backhand_thickness = formData.get('backhand_thickness') || null;
        equipmentSetup.backhand_color = formData.get('backhand_color') || null;
      }
      if (formData.get('year')) equipmentSetup.year = parseInt(formData.get('year'));
      if (formData.get('source_type')) equipmentSetup.source_type = formData.get('source_type');
      if (formData.get('source_url')) equipmentSetup.source_url = formData.get('source_url');
      
      try {
        const session = localStorage.getItem('session');
        let token = null;
        if (session) {
          try {
            const sessionData = JSON.parse(session);
            token = sessionData.access_token;
          } catch (e) {
            console.warn('Invalid session data');
          }
        }
        if (!token) {
          showErrorModal('Authentication Required', 'Please log in to submit player data');
          return;
        }
        
        const endpoint = mode === 'update' ? '/api/players/update' : '/api/players/submit';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
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
          showErrorModal('Submission Failed', result.message || 'Unknown error occurred');
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
        } catch (e) {
          console.warn('Invalid session data');
        }
      }
      
      if (!token) {
        // Redirect to login with return URL
        const currentPath = window.location.pathname;
        window.location.href = '/login?return=' + encodeURIComponent(currentPath);
      }
    });
  `
}

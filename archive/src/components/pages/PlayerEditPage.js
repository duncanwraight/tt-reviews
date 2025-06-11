import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { Layout } from '../Layout';
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb';
import { getModalScript } from '../ui/Modal';
export function PlayerEditPage({ player }) {
    const breadcrumbs = generateBreadcrumbs(`/players/${player.slug}/edit`);
    return (_jsxs(Layout, { title: `Edit ${player.name} - TT Reviews`, description: `Update ${player.name}'s profile information and equipment details.`, children: [_jsx(Breadcrumb, { items: breadcrumbs }), _jsx("section", { class: "py-8", children: _jsxs("div", { class: "main-container", children: [_jsxs("div", { class: "page-header mb-8", children: [_jsxs("h1", { class: "text-3xl font-bold text-gray-900 mb-4", children: ["Edit Player: ", player.name] }), _jsxs("p", { class: "text-lg text-gray-600 max-w-3xl", children: ["Update ", player.name, "'s profile information or add a new equipment setup. All changes will be reviewed before being published."] })] }), _jsxs("div", { class: "current-info bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8", children: [_jsx("h3", { class: "text-lg font-semibold text-gray-900 mb-3", children: "Current Information" }), _jsxs("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Name:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.name })] }), player.highest_rating && (_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Highest Rating:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.highest_rating })] })), player.active_years && (_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Active Years:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.active_years })] })), _jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Status:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.active ? 'Active' : 'Retired' })] }), player.playing_style && (_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Playing Style:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.playing_style.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) })] })), player.birth_country && (_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Birth Country:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.birth_country })] })), player.represents && (_jsxs("div", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Represents:" }), _jsx("span", { class: "ml-2 text-gray-900", children: player.represents })] }))] })] }), _jsxs("div", { class: "update-guidelines bg-amber-50 border border-amber-200 rounded-lg p-6 mb-8", children: [_jsx("h3", { class: "text-lg font-semibold text-amber-900 mb-3", children: "Update Guidelines" }), _jsxs("ul", { class: "space-y-2 text-amber-800", children: [_jsxs("li", { class: "flex items-start", children: [_jsx("span", { class: "text-amber-600 mr-2", children: "\u2022" }), "Equipment updates should reflect recent changes in the player's setup"] }), _jsxs("li", { class: "flex items-start", children: [_jsx("span", { class: "text-amber-600 mr-2", children: "\u2022" }), "Always provide reliable sources for equipment information"] }), _jsxs("li", { class: "flex items-start", children: [_jsx("span", { class: "text-amber-600 mr-2", children: "\u2022" }), "Profile updates should be based on official information"] }), _jsxs("li", { class: "flex items-start", children: [_jsx("span", { class: "text-amber-600 mr-2", children: "\u2022" }), "All changes will be reviewed before being published"] })] })] }), _jsxs("div", { class: "edit-sections space-y-12", children: [_jsxs("div", { class: "basic-info-section", children: [_jsx("h2", { class: "text-2xl font-bold text-gray-900 mb-6", children: "Edit Basic Information" }), _jsx("div", { class: "moderation-notice bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6", children: _jsxs("p", { class: "text-amber-800 text-sm", children: [_jsx("strong", { children: "Moderation Required:" }), " All profile changes will be reviewed before being published."] }) }), _jsx(BasicInfoForm, { player: player })] }), _jsxs("div", { id: "add-equipment", class: "add-equipment-section pt-8 border-t border-gray-200", children: [_jsx("h2", { class: "text-2xl font-bold text-gray-900 mb-4", children: "Add New Equipment Setup" }), _jsxs("p", { class: "text-gray-600 mb-6", children: ["Submit a new equipment setup for ", player.name, " if they've changed their equipment recently. Equipment updates are also reviewed before being published."] }), _jsx(EquipmentSetupForm, { playerSlug: player.slug })] })] })] }) }), _jsx("script", { src: "/client/auth.js" }), _jsx("script", { src: "/client/forms.js" }), _jsx("script", { src: "/client/config.js" }), _jsx("script", { dangerouslySetInnerHTML: { __html: getModalScript() } }), _jsx("script", { dangerouslySetInnerHTML: { __html: addBasicInfoSubmit() } }), _jsx("script", { dangerouslySetInnerHTML: { __html: addPlayerFormScript() } }), _jsx("script", { dangerouslySetInnerHTML: { __html: addEquipmentSetupScript() } }), _jsx("script", { dangerouslySetInnerHTML: { __html: addAuthCheckScript() } })] }));
}
// Basic information form component
function BasicInfoForm({ player }) {
    return (_jsx("div", { class: "basic-info-form bg-white rounded-lg border border-gray-200 p-6", children: _jsxs("form", { id: "basic-info-form", onsubmit: `handleBasicInfoSubmit(event, '${player.slug}')`, children: [_jsxs("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-player-name", children: "Player Name *" }), _jsx("input", { type: "text", id: "edit-player-name", name: "name", value: player.name, class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", required: true })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-highest-rating", children: "Highest Rating" }), _jsx("input", { type: "text", id: "edit-highest-rating", name: "highest_rating", value: player.highest_rating || '', class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "e.g., 3000+ ITTF Rating" })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-active-years", children: "Active Years" }), _jsx("input", { type: "text", id: "edit-active-years", name: "active_years", value: player.active_years || '', class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "e.g., 2005-2024, 2010-present" })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-active-status", children: "Status" }), _jsxs("select", { id: "edit-active-status", name: "active", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", children: [_jsx("option", { value: "true", selected: player.active !== false, children: "Active" }), _jsx("option", { value: "false", selected: player.active === false, children: "Retired" })] })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-playing-style", children: "Playing Style" }), _jsxs("select", { id: "edit-playing-style", name: "playing_style", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", children: [_jsx("option", { value: "", children: "Select playing style" }), _jsx("option", { value: "attacker", selected: player.playing_style === 'attacker', children: "Attacker" }), _jsx("option", { value: "all_rounder", selected: player.playing_style === 'all_rounder', children: "All-Rounder" }), _jsx("option", { value: "defender", selected: player.playing_style === 'defender', children: "Defender" }), _jsx("option", { value: "counter_attacker", selected: player.playing_style === 'counter_attacker', children: "Counter-Attacker" }), _jsx("option", { value: "chopper", selected: player.playing_style === 'chopper', children: "Chopper" }), _jsx("option", { value: "unknown", selected: player.playing_style === 'unknown', children: "Unknown" })] })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-birth-country", children: "Birth Country" }), _jsxs("select", { id: "edit-birth-country", name: "birth_country", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", onchange: "updateRepresentsDefault()", children: [_jsx("option", { value: "", children: "Select birth country" }), _jsx("option", { value: "CHN", selected: player.birth_country === 'CHN', children: "\uD83C\uDDE8\uD83C\uDDF3 China" }), _jsx("option", { value: "JPN", selected: player.birth_country === 'JPN', children: "\uD83C\uDDEF\uD83C\uDDF5 Japan" }), _jsx("option", { value: "GER", selected: player.birth_country === 'GER', children: "\uD83C\uDDE9\uD83C\uDDEA Germany" }), _jsx("option", { value: "KOR", selected: player.birth_country === 'KOR', children: "\uD83C\uDDF0\uD83C\uDDF7 South Korea" }), _jsx("option", { value: "SWE", selected: player.birth_country === 'SWE', children: "\uD83C\uDDF8\uD83C\uDDEA Sweden" }), _jsx("option", { value: "FRA", selected: player.birth_country === 'FRA', children: "\uD83C\uDDEB\uD83C\uDDF7 France" }), _jsx("option", { value: "HKG", selected: player.birth_country === 'HKG', children: "\uD83C\uDDED\uD83C\uDDF0 Hong Kong" }), _jsx("option", { value: "TPE", selected: player.birth_country === 'TPE', children: "\uD83C\uDDF9\uD83C\uDDFC Chinese Taipei" }), _jsx("option", { value: "SGP", selected: player.birth_country === 'SGP', children: "\uD83C\uDDF8\uD83C\uDDEC Singapore" }), _jsx("option", { value: "USA", selected: player.birth_country === 'USA', children: "\uD83C\uDDFA\uD83C\uDDF8 United States" }), _jsx("option", { value: "BRA", selected: player.birth_country === 'BRA', children: "\uD83C\uDDE7\uD83C\uDDF7 Brazil" }), _jsx("option", { value: "EGY", selected: player.birth_country === 'EGY', children: "\uD83C\uDDEA\uD83C\uDDEC Egypt" }), _jsx("option", { value: "NIG", selected: player.birth_country === 'NIG', children: "\uD83C\uDDF3\uD83C\uDDEC Nigeria" }), _jsx("option", { value: "IND", selected: player.birth_country === 'IND', children: "\uD83C\uDDEE\uD83C\uDDF3 India" }), _jsx("option", { value: "AUS", selected: player.birth_country === 'AUS', children: "\uD83C\uDDE6\uD83C\uDDFA Australia" }), _jsx("option", { value: "POL", selected: player.birth_country === 'POL', children: "\uD83C\uDDF5\uD83C\uDDF1 Poland" }), _jsx("option", { value: "ROU", selected: player.birth_country === 'ROU', children: "\uD83C\uDDF7\uD83C\uDDF4 Romania" }), _jsx("option", { value: "AUT", selected: player.birth_country === 'AUT', children: "\uD83C\uDDE6\uD83C\uDDF9 Austria" }), _jsx("option", { value: "DEN", selected: player.birth_country === 'DEN', children: "\uD83C\uDDE9\uD83C\uDDF0 Denmark" }), _jsx("option", { value: "CRO", selected: player.birth_country === 'CRO', children: "\uD83C\uDDED\uD83C\uDDF7 Croatia" })] })] }), _jsxs("div", { class: "form-group", children: [_jsxs("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "edit-represents", children: ["Represents", _jsx("span", { class: "text-sm font-normal text-gray-500", children: "(defaults to birth country)" })] }), _jsxs("select", { id: "edit-represents", name: "represents", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", children: [_jsx("option", { value: "", children: "Same as birth country" }), _jsx("option", { value: "CHN", selected: player.represents === 'CHN', children: "\uD83C\uDDE8\uD83C\uDDF3 China" }), _jsx("option", { value: "JPN", selected: player.represents === 'JPN', children: "\uD83C\uDDEF\uD83C\uDDF5 Japan" }), _jsx("option", { value: "GER", selected: player.represents === 'GER', children: "\uD83C\uDDE9\uD83C\uDDEA Germany" }), _jsx("option", { value: "KOR", selected: player.represents === 'KOR', children: "\uD83C\uDDF0\uD83C\uDDF7 South Korea" }), _jsx("option", { value: "SWE", selected: player.represents === 'SWE', children: "\uD83C\uDDF8\uD83C\uDDEA Sweden" }), _jsx("option", { value: "FRA", selected: player.represents === 'FRA', children: "\uD83C\uDDEB\uD83C\uDDF7 France" }), _jsx("option", { value: "HKG", selected: player.represents === 'HKG', children: "\uD83C\uDDED\uD83C\uDDF0 Hong Kong" }), _jsx("option", { value: "TPE", selected: player.represents === 'TPE', children: "\uD83C\uDDF9\uD83C\uDDFC Chinese Taipei" }), _jsx("option", { value: "SGP", selected: player.represents === 'SGP', children: "\uD83C\uDDF8\uD83C\uDDEC Singapore" }), _jsx("option", { value: "USA", selected: player.represents === 'USA', children: "\uD83C\uDDFA\uD83C\uDDF8 United States" }), _jsx("option", { value: "BRA", selected: player.represents === 'BRA', children: "\uD83C\uDDE7\uD83C\uDDF7 Brazil" }), _jsx("option", { value: "EGY", selected: player.represents === 'EGY', children: "\uD83C\uDDEA\uD83C\uDDEC Egypt" }), _jsx("option", { value: "NIG", selected: player.represents === 'NIG', children: "\uD83C\uDDF3\uD83C\uDDEC Nigeria" }), _jsx("option", { value: "IND", selected: player.represents === 'IND', children: "\uD83C\uDDEE\uD83C\uDDF3 India" }), _jsx("option", { value: "AUS", selected: player.represents === 'AUS', children: "\uD83C\uDDE6\uD83C\uDDFA Australia" }), _jsx("option", { value: "POL", selected: player.represents === 'POL', children: "\uD83C\uDDF5\uD83C\uDDF1 Poland" }), _jsx("option", { value: "ROU", selected: player.represents === 'ROU', children: "\uD83C\uDDF7\uD83C\uDDF4 Romania" }), _jsx("option", { value: "AUT", selected: player.represents === 'AUT', children: "\uD83C\uDDE6\uD83C\uDDF9 Austria" }), _jsx("option", { value: "DEN", selected: player.represents === 'DEN', children: "\uD83C\uDDE9\uD83C\uDDF0 Denmark" }), _jsx("option", { value: "CRO", selected: player.represents === 'CRO', children: "\uD83C\uDDED\uD83C\uDDF7 Croatia" }), _jsx("option", { value: "SVK", selected: player.represents === 'SVK', children: "\uD83C\uDDF8\uD83C\uDDF0 Slovakia" })] })] })] }), _jsx("div", { class: "form-actions flex justify-end mt-6", children: _jsx("button", { type: "submit", class: "px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500", children: "Submit Changes for Review" }) })] }) }));
}
// Separate form component for adding equipment setups
function EquipmentSetupForm({ playerSlug }) {
    return (_jsx("div", { class: "equipment-setup-form bg-white rounded-lg border border-gray-200 p-6", children: _jsxs("form", { onsubmit: `handleEquipmentSetupSubmit(event, '${playerSlug}')`, children: [_jsxs("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { class: "form-group col-span-full", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-blade", children: "Blade" }), _jsxs("div", { class: "equipment-search-container", children: [_jsx("input", { type: "text", id: "new-blade", name: "blade_search", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "Search for blade", oninput: "searchEquipment('new_blade', this.value)" }), _jsx("div", { id: "new-blade-results", class: "equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto" }), _jsx("input", { type: "hidden", name: "blade_id", id: "new-blade-id" })] })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-forehand-rubber", children: "Forehand Rubber" }), _jsxs("div", { class: "equipment-search-container", children: [_jsx("input", { type: "text", id: "new-forehand-rubber", name: "forehand_rubber_search", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "Search for rubber", oninput: "searchEquipment('new_forehand_rubber', this.value)" }), _jsx("div", { id: "new-forehand-rubber-results", class: "equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto" }), _jsx("input", { type: "hidden", name: "forehand_rubber_id", id: "new-forehand-rubber-id" })] }), _jsxs("div", { class: "rubber-details grid grid-cols-2 gap-2 mt-2", children: [_jsxs("select", { name: "forehand_thickness", class: "px-2 py-1 border border-gray-300 rounded text-sm", children: [_jsx("option", { value: "", children: "Thickness" }), _jsx("option", { value: "1.5mm", children: "1.5mm" }), _jsx("option", { value: "1.8mm", children: "1.8mm" }), _jsx("option", { value: "2.0mm", children: "2.0mm" }), _jsx("option", { value: "max", children: "Max" })] }), _jsxs("select", { name: "forehand_color", class: "px-2 py-1 border border-gray-300 rounded text-sm", children: [_jsx("option", { value: "", children: "Color" }), _jsx("option", { value: "red", children: "Red" }), _jsx("option", { value: "black", children: "Black" })] })] })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-backhand-rubber", children: "Backhand Rubber" }), _jsxs("div", { class: "equipment-search-container", children: [_jsx("input", { type: "text", id: "new-backhand-rubber", name: "backhand_rubber_search", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "Search for rubber", oninput: "searchEquipment('new_backhand_rubber', this.value)" }), _jsx("div", { id: "new-backhand-rubber-results", class: "equipment-results hidden mt-2 bg-white border border-gray-200 rounded-md shadow-sm max-h-40 overflow-y-auto" }), _jsx("input", { type: "hidden", name: "backhand_rubber_id", id: "new-backhand-rubber-id" })] }), _jsxs("div", { class: "rubber-details grid grid-cols-2 gap-2 mt-2", children: [_jsxs("select", { name: "backhand_thickness", class: "px-2 py-1 border border-gray-300 rounded text-sm", children: [_jsx("option", { value: "", children: "Thickness" }), _jsx("option", { value: "1.5mm", children: "1.5mm" }), _jsx("option", { value: "1.8mm", children: "1.8mm" }), _jsx("option", { value: "2.0mm", children: "2.0mm" }), _jsx("option", { value: "max", children: "Max" })] }), _jsxs("select", { name: "backhand_color", class: "px-2 py-1 border border-gray-300 rounded text-sm", children: [_jsx("option", { value: "", children: "Color" }), _jsx("option", { value: "red", children: "Red" }), _jsx("option", { value: "black", children: "Black" })] })] })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-setup-year", children: "Year *" }), _jsx("input", { type: "number", id: "new-setup-year", name: "year", min: "2000", max: "2025", value: new Date().getFullYear(), required: true, class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" })] }), _jsxs("div", { class: "form-group", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-source-type", children: "Source Type" }), _jsxs("select", { id: "new-source-type", name: "source_type", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", children: [_jsx("option", { value: "", children: "Select source type" }), _jsx("option", { value: "interview", children: "Interview" }), _jsx("option", { value: "video", children: "Video" }), _jsx("option", { value: "tournament_footage", children: "Tournament Footage" }), _jsx("option", { value: "official_website", children: "Official Website" })] })] }), _jsxs("div", { class: "form-group col-span-full", children: [_jsx("label", { class: "block text-sm font-medium text-gray-700 mb-2", for: "new-source-url", children: "Source URL (optional)" }), _jsx("input", { type: "url", id: "new-source-url", name: "source_url", class: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "https://..." })] })] }), _jsx("div", { class: "form-actions flex justify-end mt-6", children: _jsx("button", { type: "submit", class: "px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500", children: "Add Equipment Setup" }) })] }) }));
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
        active: formData.get('active') === 'true',
        playing_style: formData.get('playing_style') || null,
        birth_country: formData.get('birth_country') || null,
        represents: formData.get('represents') || null
      };
      
      try {
        const response = await window.authenticatedFetch('/api/players/' + playerSlug + '/edit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
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
  `;
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
        const response = await window.authenticatedFetch('/api/players/' + playerSlug + '/equipment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
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
  `;
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
  `;
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
  `;
}

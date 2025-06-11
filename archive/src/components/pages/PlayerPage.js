import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "hono/jsx/jsx-runtime";
import { Layout } from '../Layout';
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb';
// Helper function to get country flag emoji
function getCountryFlag(countryCode) {
    const flags = {
        CHN: '🇨🇳',
        JPN: '🇯🇵',
        GER: '🇩🇪',
        KOR: '🇰🇷',
        SWE: '🇸🇪',
        FRA: '🇫🇷',
        HKG: '🇭🇰',
        TPE: '🇹🇼',
        SGP: '🇸🇬',
        USA: '🇺🇸',
        BRA: '🇧🇷',
        EGY: '🇪🇬',
        NIG: '🇳🇬',
        IND: '🇮🇳',
        AUS: '🇦🇺',
        POL: '🇵🇱',
        ROU: '🇷🇴',
        AUT: '🇦🇹',
        DEN: '🇩🇰',
        CRO: '🇭🇷',
        SVK: '🇸🇰',
    };
    return flags[countryCode] || '🏳️';
}
export function PlayerPage({ player, equipmentSetups, videos = [], careerStats }) {
    const breadcrumbs = generateBreadcrumbs(`/players/${player.slug}`);
    return (_jsxs(Layout, { title: `${player.name} Equipment & Setup`, description: `Complete equipment setup for ${player.name}. See what blade, forehand and backhand rubbers the pro uses, with historical changes and sources.`, structuredData: generatePlayerSchema(player, equipmentSetups), children: [_jsx(Breadcrumb, { items: breadcrumbs }), _jsx(PlayerHeader, { player: player }), _jsx(PlayerTabs, { player: player, equipmentSetups: equipmentSetups, videos: videos, careerStats: careerStats }), _jsx("script", { src: "/client/auth.js" }), _jsx("script", { dangerouslySetInnerHTML: {
                    __html: `
          document.addEventListener('DOMContentLoaded', function() {
            // Show edit buttons if user is logged in
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
            
            const editBtn = document.getElementById('edit-player-btn');
            const addEquipmentBtn = document.getElementById('add-equipment-btn');
            
            if (token) {
              if (editBtn) {
                editBtn.classList.remove('hidden');
              }
              if (addEquipmentBtn) {
                addEquipmentBtn.classList.remove('hidden');
              }
            }
          });
        `,
                } })] }));
}
function PlayerHeader({ player }) {
    return (_jsx("section", { class: "player-header bg-white border-b border-gray-200 py-8", children: _jsx("div", { class: "main-container", children: _jsxs("div", { class: "player-info grid grid-cols-1 lg:grid-cols-6 gap-8 items-center", children: [_jsx("div", { class: "player-photo lg:col-span-1", children: _jsx("div", { class: "w-36 h-36 bg-gray-200 rounded-lg flex items-center justify-center text-6xl text-gray-400 mx-auto lg:mx-0", children: "\uD83D\uDCF7" }) }), _jsxs("div", { class: "player-details lg:col-span-4 text-center lg:text-left", children: [_jsx("h1", { class: "text-3xl font-bold text-gray-900 mb-4", children: player.name }), _jsxs("div", { class: "player-meta flex flex-wrap justify-center lg:justify-start gap-6 mb-4 text-sm", children: [(player.represents || player.birth_country) && (_jsxs("span", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Represents:" }), ' ', getCountryFlag(player.represents || player.birth_country), ' ', player.represents || player.birth_country] })), player.highest_rating && (_jsxs("span", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Highest Rating:" }), ' ', player.highest_rating] })), player.active_years && (_jsxs("span", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Active:" }), " ", player.active_years] })), player.playing_style && (_jsxs("span", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Style:" }), ' ', player.playing_style
                                                .replace('_', ' ')
                                                .replace(/\b\w/g, (l) => l.toUpperCase())] }))] })] }), _jsxs("div", { class: "player-stats lg:col-span-1 text-center lg:text-right", children: [_jsx("div", { class: "mb-4", children: _jsx("button", { id: "edit-player-btn", class: "hidden px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500", onclick: `window.location.href='/players/${player.slug}/edit'`, children: "Edit Player" }) }), _jsx("p", { class: "text-sm text-gray-600 mb-2", children: _jsx("span", { class: "font-medium text-gray-900", children: "Notable Achievements" }) }), _jsx("p", { class: "text-sm text-gray-600", children: "World Championship semifinalist, Olympic bronze medalist" })] })] }) }) }));
}
function PlayerTabs({ player, equipmentSetups, videos, careerStats, }) {
    return (_jsxs(_Fragment, { children: [_jsx("section", { class: "tabs bg-white border-b border-gray-200", children: _jsxs("div", { class: "tab-nav flex max-w-7xl mx-auto px-4", children: [_jsx("button", { class: "tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600 active border-purple-600 text-purple-600", onclick: "switchTab('timeline')", children: "Equipment Timeline" }), _jsx("button", { class: "tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600", onclick: "switchTab('videos')", children: "Videos" }), _jsx("button", { class: "tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600", onclick: "switchTab('stats')", children: "Career Stats" })] }) }), _jsxs("section", { class: "tab-content py-8", children: [_jsx("div", { id: "timeline-content", children: _jsx(EquipmentTimeline, { equipmentSetups: equipmentSetups, playerId: player.slug, playerName: player.name }) }), _jsx("div", { id: "videos-content", style: "display: none;", children: _jsx(VideosSection, { videos: videos }) }), _jsx("div", { id: "stats-content", style: "display: none;", children: _jsx(CareerStats, { stats: careerStats }) })] })] }));
}
function EquipmentTimeline({ equipmentSetups, playerId, playerName, }) {
    // Mock data if no setups provided
    const mockSetups = equipmentSetups.length
        ? equipmentSetups
        : [
            {
                year: 2019,
                blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
                forehand: { name: 'Butterfly Tenergy 64 (red, max)', slug: 'butterfly-tenergy-64' },
                backhand: { name: 'Victas Curl P3aV (black, 1.5mm)', slug: 'victas-curl-p3av' },
                source: { text: 'YouTube video', url: 'https://youtube.com/watch' },
            },
            {
                year: 2007,
                blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
                forehand: { name: 'Butterfly Tenergy 64 (red, max)', slug: 'butterfly-tenergy-64' },
                backhand: { name: 'TSP Curl P1-R (black, 1.5mm)', slug: 'tsp-curl-p1-r' },
                source: { text: 'Player interview', url: 'https://example.com/interview' },
            },
        ];
    return (_jsxs("div", { class: "main-container", children: [_jsxs("div", { class: "timeline-header flex justify-between items-center mb-6", children: [_jsx("h2", { class: "text-2xl font-bold text-gray-900", children: "Equipment Timeline" }), _jsx("button", { id: "add-equipment-btn", class: "hidden px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500", onclick: `window.location.href='/players/${playerId}/edit#add-equipment'`, children: "Add Equipment Setup" })] }), _jsxs("div", { class: "timeline relative pl-8", children: [_jsx("div", { class: "timeline-line absolute left-3 top-0 bottom-0 w-0.5 bg-gray-300" }), mockSetups.map((setup, index) => (_jsx(TimelineItem, { setup: setup }, index)))] })] }));
}
function TimelineItem({ setup }) {
    return (_jsxs("div", { class: "timeline-item relative mb-8 bg-white rounded-lg p-6 border border-gray-200 shadow-sm", children: [_jsx("div", { class: "timeline-marker absolute -left-7 top-6 w-3 h-3 bg-purple-600 rounded-full border-2 border-white" }), _jsx("div", { class: "timeline-year text-xl font-semibold text-purple-600 mb-4", children: setup.year }), _jsxs("div", { class: "equipment-setup space-y-3", children: [_jsx(EquipmentItem, { label: "Blade", item: setup.blade }), _jsx(EquipmentItem, { label: "Forehand", item: setup.forehand }), _jsx(EquipmentItem, { label: "Backhand", item: setup.backhand })] }), setup.source && (_jsxs("a", { href: setup.source.url, class: "source-link inline-block mt-4 text-sm text-blue-600 hover:text-blue-800 hover:underline", target: "_blank", rel: "noopener noreferrer", children: ["Source: ", setup.source.text] }))] }));
}
function EquipmentItem({ label, item }) {
    if (!item)
        return null;
    return (_jsxs("div", { class: "equipment-item flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-100", children: [_jsxs("span", { class: "equipment-label font-medium text-gray-700", children: [label, ":"] }), _jsx("a", { href: `/equipment/${item.slug}`, class: "equipment-name font-semibold text-purple-600 hover:text-purple-800 hover:underline", onclick: `navigate('/equipment/${item.slug}'); return false;`, children: item.name })] }));
}
function VideosSection({ videos }) {
    return (_jsx("div", { class: "main-container", children: _jsxs("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { class: "card bg-white rounded-lg p-6 border border-gray-200", children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-3", children: "Training Videos" }), _jsx("p", { class: "text-gray-600", children: "Professional training footage and technique analysis" })] }), _jsxs("div", { class: "card bg-white rounded-lg p-6 border border-gray-200", children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-3", children: "Match Highlights" }), _jsx("p", { class: "text-gray-600", children: "Tournament matches and competitive play" })] })] }) }));
}
function CareerStats({ stats }) {
    return (_jsx("div", { class: "main-container", children: _jsxs("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { class: "card bg-white rounded-lg p-6 border border-gray-200", children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-3", children: "Rankings" }), _jsx("p", { class: "text-gray-600", children: "Historical world ranking progression" })] }), _jsxs("div", { class: "card bg-white rounded-lg p-6 border border-gray-200", children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-3", children: "Achievements" }), _jsx("p", { class: "text-gray-600", children: "Major tournament wins and medals" })] })] }) }));
}
function generatePlayerSchema(player, equipmentSetups) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: player.name,
        description: `Professional table tennis player equipment setup and profile`,
        sport: 'Table Tennis',
        nationality: 'Unknown', // TODO: Add to player data
        award: 'World Championship semifinalist, Olympic bronze medalist',
        url: `https://tt-reviews.local/players/${player.slug}`,
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://tt-reviews.local/players/${player.slug}`,
        },
    };
}
// Add tab switching functionality via inline script
function addTabScript() {
    return `
    function switchTab(tabName) {
      // Remove active class from all buttons
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active', 'border-purple-600', 'text-purple-600');
        btn.classList.add('border-transparent', 'text-gray-700');
      });
      
      // Hide all content
      document.querySelectorAll('[id$="-content"]').forEach(content => {
        content.style.display = 'none';
      });
      
      // Show selected content and activate button
      const button = document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`);
      const content = document.getElementById(\`\${tabName}-content\`);
      
      if (button && content) {
        button.classList.add('active', 'border-purple-600', 'text-purple-600');
        button.classList.remove('border-transparent', 'text-gray-700');
        content.style.display = 'block';
      }
    }
  `;
}

import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { Layout } from '../Layout';
import { RatingStars } from '../ui/RatingStars';
export const HomePage = ({ featuredEquipment = [], popularPlayers = [] }) => {
    return (_jsxs(Layout, { title: "Trusted Table Tennis Equipment Reviews", description: "Community-driven equipment reviews by real players. Find the perfect blade, rubber, and setup for your playing style.", structuredData: generateHomePageSchema(), children: [_jsx(HeroSection, {}), _jsx(FeaturedReviews, { equipment: featuredEquipment }), _jsx(PopularPlayers, { players: popularPlayers }), _jsx(EquipmentCategories, {})] }));
};
const HeroSection = () => {
    return (_jsx("section", { class: "hero text-center py-16 bg-gradient-to-br from-purple-50 to-teal-50", children: _jsxs("div", { class: "main-container", children: [_jsx("h1", { class: "text-4xl font-bold text-gray-900 mb-4", children: "Trusted Table Tennis Reviews" }), _jsx("p", { class: "text-xl text-gray-600 mb-8 max-w-2xl mx-auto", children: "Community-driven equipment reviews by real players" }), _jsx("div", { class: "hero-search max-w-2xl mx-auto", children: _jsx("input", { type: "text", class: "search-input w-full py-4 px-6 text-lg border border-gray-300 rounded-xl bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", placeholder: "Search for equipment, players, or reviews..." }) })] }) }));
};
const FeaturedReviews = ({ equipment }) => {
    const mockEquipment = equipment.length
        ? equipment
        : [
            {
                id: '1',
                slug: 'butterfly-tenergy-64',
                name: 'Butterfly Tenergy 64',
                category: 'rubber',
                manufacturer: 'Butterfly',
                specifications: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                rating: 4.5,
                reviewCount: 23,
                description: 'High-performance forehand rubber with excellent spin generation and speed.',
            },
            {
                id: '2',
                slug: 'tsp-curl-p1-r',
                name: 'TSP Curl P1-R',
                category: 'rubber',
                manufacturer: 'TSP',
                specifications: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                rating: 4.2,
                reviewCount: 18,
                description: 'Classic long pips rubber perfect for defensive play and spin reversal.',
            },
            {
                id: '3',
                slug: 'stiga-clipper',
                name: 'Stiga Clipper',
                category: 'blade',
                manufacturer: 'Stiga',
                specifications: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                rating: 4.7,
                reviewCount: 31,
                description: 'Legendary blade combining speed and control for all-round players.',
            },
        ];
    return (_jsx("section", { class: "section py-12", children: _jsxs("div", { class: "main-container", children: [_jsxs("div", { class: "section-header text-center mb-8", children: [_jsx("h2", { class: "text-3xl font-semibold text-gray-900 mb-2", children: "Featured Reviews" }), _jsx("p", { class: "text-lg text-gray-600", children: "Latest highly-rated equipment reviews from our community" })] }), _jsx("div", { class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", children: mockEquipment.map(item => (_jsx(EquipmentCard, { equipment: item }, item.slug))) })] }) }));
};
const PopularPlayers = ({ players }) => {
    const mockPlayers = players.length
        ? players
        : [
            {
                id: '1',
                slug: 'joo-saehyuk',
                name: 'Joo Saehyuk',
                highest_rating: 'WR6',
                active_years: '1992-2016',
                active: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                highestRating: 'WR6',
                style: 'Defensive chopper',
                currentSetup: 'Butterfly Diode, Tenergy 64 FH',
            },
            {
                id: '2',
                slug: 'ma-long',
                name: 'Ma Long',
                highest_rating: 'WR1',
                active_years: '2007-present',
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                highestRating: 'WR1',
                style: 'Offensive all-round',
                currentSetup: 'Hurricane Long 5, Hurricane 3',
            },
            {
                id: '3',
                slug: 'timo-boll',
                name: 'Timo Boll',
                highest_rating: 'WR1',
                active_years: '1997-present',
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                highestRating: 'WR1',
                style: 'Classic European',
                currentSetup: 'Butterfly Timo Boll ALC',
            },
        ];
    return (_jsx("section", { class: "section py-12 bg-white", children: _jsxs("div", { class: "main-container", children: [_jsxs("div", { class: "section-header text-center mb-8", children: [_jsx("h2", { class: "text-3xl font-semibold text-gray-900 mb-2", children: "Popular Players" }), _jsx("p", { class: "text-lg text-gray-600", children: "Explore equipment setups from professional players" })] }), _jsx("div", { class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", children: mockPlayers.map(player => (_jsx(PlayerCard, { player: player }, player.slug))) })] }) }));
};
const EquipmentCategories = () => {
    const categories = [
        {
            icon: '🏓',
            name: 'Blades',
            href: '/equipment/blades',
            description: 'Wooden and composite blades for all playing styles',
        },
        {
            icon: '🔴',
            name: 'Forehand Rubbers',
            href: '/equipment/forehand-rubbers',
            description: 'Inverted rubbers for attack and spin generation',
        },
        {
            icon: '⚫',
            name: 'Backhand Rubbers',
            href: '/equipment/backhand-rubbers',
            description: 'All rubber types for backhand play',
        },
        {
            icon: '🎯',
            name: 'Long Pips',
            href: '/equipment/long-pips',
            description: 'Defensive rubbers for spin reversal',
        },
        {
            icon: '🛡️',
            name: 'Anti-Spin',
            href: '/equipment/anti-spin',
            description: 'Low-friction rubbers for defensive play',
        },
        {
            icon: '📚',
            name: 'Training Equipment',
            href: '/equipment/training',
            description: 'Practice aids and training tools',
        },
    ];
    return (_jsx("section", { class: "section py-12", children: _jsxs("div", { class: "main-container", children: [_jsxs("div", { class: "section-header text-center mb-8", children: [_jsx("h2", { class: "text-3xl font-semibold text-gray-900 mb-2", children: "Equipment Categories" }), _jsx("p", { class: "text-lg text-gray-600", children: "Find the right equipment for your playing style" })] }), _jsx("div", { class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", children: categories.map(category => (_jsx(CategoryCard, { category: category }, category.href))) })] }) }));
};
const EquipmentCard = ({ equipment }) => {
    return (_jsxs("a", { class: "card bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-1 block", href: `/equipment/${equipment.slug}`, children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-2", children: equipment.name }), _jsx(RatingStars, { rating: equipment.rating || 0, count: equipment.reviewCount }), _jsx("p", { class: "text-gray-600 mt-3", children: equipment.description })] }));
};
const PlayerCard = ({ player }) => {
    return (_jsxs("a", { class: "card bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-1 block", href: `/players/${player.slug}`, children: [_jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-3", children: player.name }), _jsxs("div", { class: "space-y-2 text-sm", children: [_jsxs("p", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Highest Rating:" }), ' ', player.highest_rating || player.highestRating] }), _jsxs("p", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Style:" }), " ", player.style] }), _jsxs("p", { children: [_jsx("span", { class: "font-medium text-gray-700", children: "Current Setup:" }), " ", player.currentSetup] })] })] }));
};
const CategoryCard = ({ category }) => {
    return (_jsxs("a", { class: "category-card bg-white rounded-lg p-8 text-center border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all duration-200 cursor-pointer block", href: category.href, children: [_jsx("div", { class: "category-icon text-4xl mb-4", children: category.icon }), _jsx("h3", { class: "text-xl font-semibold text-gray-900 mb-2", children: category.name }), _jsx("p", { class: "text-gray-600", children: category.description })] }));
};
function generateHomePageSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'TT Reviews',
        description: 'Community-driven table tennis equipment reviews by real players',
        url: 'https://tt-reviews.local',
        potentialAction: {
            '@type': 'SearchAction',
            target: 'https://tt-reviews.local/search?q={search_term_string}',
            'query-input': 'required name=search_term_string',
        },
    };
}

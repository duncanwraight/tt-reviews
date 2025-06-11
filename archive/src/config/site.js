export const siteConfig = {
    siteName: 'TT Reviews',
    siteUrl: 'https://tt-reviews.local', // Will be updated for production
    description: 'Trusted table tennis equipment reviews by the community',
    logo: '🏓',
    social: {
        discord: 'https://discord.gg/Ycp7mKA3Yw',
    },
};
// SEO defaults
export const defaultSEO = {
    title: 'TT Reviews - Trusted Table Tennis Equipment Reviews',
    description: 'Community-driven equipment reviews by real players. Find the perfect blade, rubber, and setup for your playing style.',
    keywords: 'table tennis, ping pong, equipment reviews, blades, rubbers, professional players',
    ogImage: '/og-image.jpg', // TODO: Create OG image
};
// Navigation structure
export const navigation = [
    { label: 'Equipment', href: '/equipment' },
    { label: 'Players', href: '/players' },
    { label: 'Search', href: '/search' },
];

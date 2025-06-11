import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
export function Breadcrumb({ items }) {
    if (!items.length)
        return null;
    return (_jsx("nav", { class: "breadcrumb bg-white border-b border-gray-200 py-3", children: _jsx("div", { class: "breadcrumb-container max-w-6xl mx-auto px-4", children: _jsx("div", { class: "breadcrumb-nav flex items-center gap-2 text-sm text-gray-600", children: items.map((item, index) => (_jsxs("div", { class: "flex items-center gap-2", children: [index > 0 && _jsx("span", { class: "breadcrumb-separator text-gray-400 font-bold", children: "\u203A" }), item.current ? (_jsx("span", { class: "breadcrumb-current text-gray-900 font-medium", children: item.label })) : (_jsx("a", { href: item.href, class: "breadcrumb-link text-gray-600 hover:text-purple-600 hover:underline transition-colors", onclick: `navigate('${item.href}'); return false;`, children: item.label }))] }, index))) }) }) }));
}
export function generateBreadcrumbs(pathname) {
    const segments = pathname.split('/').filter(segment => segment);
    if (segments.length === 0)
        return [];
    const breadcrumbs = [{ label: 'Home', href: '/' }];
    // Equipment breadcrumbs
    if (segments[0] === 'equipment') {
        breadcrumbs.push({ label: 'Equipment', href: '/equipment' });
        if (segments[1]) {
            const equipmentNames = {
                'butterfly-tenergy-64': 'Butterfly Tenergy 64',
                'tsp-curl-p1-r': 'TSP Curl P1-R',
                'stiga-clipper': 'Stiga Clipper',
                blades: 'Blades',
                'forehand-rubbers': 'Forehand Rubbers',
                'backhand-rubbers': 'Backhand Rubbers',
                'long-pips': 'Long Pips',
                'anti-spin': 'Anti-Spin',
                training: 'Training Equipment',
            };
            const equipmentName = equipmentNames[segments[1]] || segments[1].replace(/-/g, ' ');
            breadcrumbs.push({ label: equipmentName, href: pathname, current: true });
        }
    }
    // Player breadcrumbs
    if (segments[0] === 'players') {
        breadcrumbs.push({ label: 'Players', href: '/players' });
        if (segments[1]) {
            const playerNames = {
                'joo-saehyuk': 'Joo Saehyuk',
                'ma-long': 'Ma Long',
                'timo-boll': 'Timo Boll',
            };
            const playerName = playerNames[segments[1]] || segments[1].replace(/-/g, ' ');
            breadcrumbs.push({ label: playerName, href: pathname, current: true });
        }
    }
    // Search breadcrumbs
    if (segments[0] === 'search') {
        breadcrumbs.push({ label: 'Search Results', href: pathname, current: true });
    }
    return breadcrumbs;
}

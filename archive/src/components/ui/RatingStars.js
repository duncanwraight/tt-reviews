import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
export const RatingStars = ({ rating, count, size = 'medium' }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const sizeClasses = {
        small: 'text-sm',
        medium: 'text-base',
        large: 'text-lg',
    };
    return (_jsxs("div", { class: `rating flex items-center gap-1 ${sizeClasses[size]}`, children: [_jsxs("div", { class: "stars flex text-yellow-500", children: [Array(fullStars)
                        .fill(0)
                        .map((_, i) => (_jsx("span", { children: "\u2605" }, `full-${i}`))), hasHalfStar && _jsx("span", { children: "\u2606" }), Array(emptyStars)
                        .fill(0)
                        .map((_, i) => (_jsx("span", { class: "text-gray-300", children: "\u2606" }, `empty-${i}`)))] }), count !== undefined && (_jsxs("span", { class: "rating-text text-sm text-gray-600 ml-2", children: ["(", count, " review", count !== 1 ? 's' : '', ")"] }))] }));
};
export const RatingBars = ({ ratings }) => {
    return (_jsx("div", { class: "rating-bars space-y-3", children: Object.entries(ratings).map(([metric, value]) => (_jsxs("div", { class: "rating-bar flex items-center gap-3", children: [_jsx("span", { class: "rating-label min-w-20 text-sm font-medium text-gray-700 capitalize", children: metric }), _jsx("div", { class: "rating-progress flex-1 h-2 bg-gray-200 rounded-full overflow-hidden", children: _jsx("div", { class: "rating-fill h-full bg-teal-500 transition-all duration-300 ease-out", style: `width: ${(value / 10) * 100}%` }) }), _jsxs("span", { class: "rating-value min-w-8 text-right text-sm font-semibold text-gray-900", children: [value, "/10"] })] }, metric))) }));
};

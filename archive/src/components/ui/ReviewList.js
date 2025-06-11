import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { RatingStars } from './RatingStars.js';
function ReviewItem({ review, showEquipmentName = false }) {
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };
    const getStatusBadge = (status) => {
        const badges = {
            pending: 'bg-yellow-100 text-yellow-800',
            approved: 'bg-green-100 text-green-800',
            rejected: 'bg-red-100 text-red-800',
        };
        return badges[status] || badges.pending;
    };
    const categoryLabels = {
        spin: 'Spin',
        speed: 'Speed',
        control: 'Control',
        spin_sensitivity: 'Spin Sensitivity',
        reversal: 'Reversal',
        dwell: 'Dwell',
        feel: 'Feel',
        quality: 'Quality',
    };
    return (_jsxs("div", { class: "bg-white rounded-lg shadow-md p-6 border border-gray-200", children: [_jsxs("div", { class: "flex justify-between items-start mb-4", children: [_jsxs("div", { children: [showEquipmentName && review.equipment && (_jsx("h4", { class: "text-lg font-medium text-gray-900 mb-1", children: review.equipment.name })), _jsxs("div", { class: "flex items-center space-x-3", children: [_jsx(RatingStars, { rating: review.overall_rating / 2 }), _jsxs("span", { class: "text-lg font-semibold text-gray-900", children: [review.overall_rating, "/10"] })] })] }), _jsxs("div", { class: "text-right", children: [_jsx("span", { class: `inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(review.status)}`, children: review.status.charAt(0).toUpperCase() + review.status.slice(1) }), _jsx("p", { class: "text-sm text-gray-500 mt-1", children: formatDate(review.created_at) })] })] }), Object.keys(review.category_ratings).length > 0 && (_jsxs("div", { class: "mb-4", children: [_jsx("h5", { class: "text-sm font-medium text-gray-700 mb-2", children: "Category Ratings" }), _jsx("div", { class: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3", children: Object.entries(review.category_ratings).map(([category, rating]) => (_jsxs("div", { class: "flex justify-between items-center", children: [_jsxs("span", { class: "text-sm text-gray-600", children: [categoryLabels[category] || category, ":"] }), _jsxs("span", { class: "font-medium text-gray-900", children: [rating, "/10"] })] }, category))) })] })), review.review_text && (_jsx("div", { class: "mb-4", children: _jsx("p", { class: "text-gray-700 leading-relaxed", children: review.review_text }) })), review.reviewer_context && Object.keys(review.reviewer_context).length > 0 && (_jsxs("div", { class: "border-t border-gray-200 pt-4", children: [_jsx("h5", { class: "text-sm font-medium text-gray-700 mb-2", children: "Reviewer Info" }), _jsxs("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-3 text-sm", children: [review.reviewer_context.playing_level && (_jsxs("div", { children: [_jsx("span", { class: "text-gray-600", children: "Level:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.playing_level })] })), review.reviewer_context.style_of_play && (_jsxs("div", { children: [_jsx("span", { class: "text-gray-600", children: "Style:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.style_of_play })] })), review.reviewer_context.testing_duration && (_jsxs("div", { children: [_jsx("span", { class: "text-gray-600", children: "Testing Duration:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.testing_duration })] })), review.reviewer_context.testing_quantity && (_jsxs("div", { children: [_jsx("span", { class: "text-gray-600", children: "Testing Quantity:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.testing_quantity })] })), review.reviewer_context.other_equipment && (_jsxs("div", { class: "md:col-span-2", children: [_jsx("span", { class: "text-gray-600", children: "Other Equipment:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.other_equipment })] })), review.reviewer_context.purchase_price && (_jsxs("div", { children: [_jsx("span", { class: "text-gray-600", children: "Purchase:" }), ' ', _jsx("span", { class: "text-gray-900", children: review.reviewer_context.purchase_price })] }))] })] }))] }));
}
export function ReviewList({ reviews, showEquipmentName = false }) {
    if (reviews.length === 0) {
        return (_jsx("div", { class: "text-center py-8", children: _jsxs("div", { class: "text-gray-500", children: [_jsx("svg", { class: "mx-auto h-12 w-12 text-gray-400 mb-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M7 8h10m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0v10a2 2 0 002 2h6a2 2 0 002-2V8m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0v10a2 2 0 002 2h6a2 2 0 002-2V8" }) }), _jsx("h3", { class: "text-lg font-medium text-gray-900 mb-2", children: "No reviews yet" }), _jsx("p", { class: "text-gray-600", children: "Be the first to review this equipment!" })] }) }));
    }
    return (_jsx("div", { class: "space-y-6", children: reviews.map(review => (_jsx(ReviewItem, { review: review, showEquipmentName: showEquipmentName }, review.id))) }));
}

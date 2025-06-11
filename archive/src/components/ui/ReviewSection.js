import { jsxs as _jsxs, jsx as _jsx } from "hono/jsx/jsx-runtime";
import { ReviewForm } from './ReviewForm.js';
import { ReviewList } from './ReviewList.js';
export const ReviewSection = ({ equipment, reviews, userReview }) => {
    return (_jsxs("div", { class: "space-y-8", "data-equipment-id": equipment.id, children: [_jsxs("div", { class: "flex justify-between items-center", children: [_jsxs("h2", { class: "text-2xl font-bold text-gray-900", children: ["Reviews (", reviews.length, ")"] }), _jsxs("div", { class: "space-x-3", children: [userReview ? (_jsx("div", { class: "text-sm text-gray-600", children: "You've already reviewed this equipment" })) : (_jsxs("div", { children: [_jsx("button", { id: "write-review-btn", class: "hidden bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500", children: "Write Review" }), _jsx("a", { href: "/login", id: "login-link", class: "bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 inline-block", children: "Login to Review" })] })), _jsx("button", { id: "logout-btn", class: "hidden text-gray-600 hover:text-gray-800 text-sm", children: "Logout" })] })] }), _jsx("div", { id: "review-form-container", class: "hidden", children: _jsx(ReviewForm, { equipment: equipment }) }), _jsx(ReviewList, { reviews: reviews }), _jsx("script", { dangerouslySetInnerHTML: {
                    __html: `
          (function() {
            const token = localStorage.getItem('access_token');
            const writeReviewBtn = document.getElementById('write-review-btn');
            const loginLink = document.getElementById('login-link');
            const logoutBtn = document.getElementById('logout-btn');
            const reviewFormContainer = document.getElementById('review-form-container');

            if (token) {
              // User is authenticated
              writeReviewBtn.classList.remove('hidden');
              loginLink.classList.add('hidden');
              logoutBtn.classList.remove('hidden');

              writeReviewBtn.onclick = function() {
                reviewFormContainer.classList.toggle('hidden');
                writeReviewBtn.textContent = reviewFormContainer.classList.contains('hidden') 
                  ? 'Write Review' 
                  : 'Cancel Review';
              };

              logoutBtn.onclick = function() {
                localStorage.removeItem('access_token');
                location.reload();
              };
            }
          })();
        `,
                } })] }));
};

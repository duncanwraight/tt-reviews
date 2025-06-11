import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { Layout } from '../Layout';
import { getModalScript } from '../ui/Modal';
export const AdminPlayerEditsPage = ({ playerEdits, total }) => {
    return (_jsxs(Layout, { title: "Player Edit Moderation - TT Reviews", children: [_jsx("div", { class: "container mx-auto px-4 py-8", children: _jsxs("div", { class: "max-w-6xl mx-auto", children: [_jsx("div", { class: "mb-8", children: _jsxs("div", { class: "flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("h1", { class: "text-3xl font-bold text-gray-900 mb-2", children: "Player Edit Moderation" }), _jsxs("p", { class: "text-gray-600", children: [total, " pending player edit", total !== 1 ? 's' : '', " awaiting moderation"] })] }), _jsx("a", { href: "/admin", class: "bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors", children: "\u2190 Back to Dashboard" })] }) }), playerEdits.length === 0 ? (_jsxs("div", { class: "bg-white rounded-lg shadow p-8 text-center", children: [_jsx("svg", { class: "w-16 h-16 text-gray-400 mx-auto mb-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" }) }), _jsx("h3", { class: "text-lg font-medium text-gray-900 mb-2", children: "All caught up!" }), _jsx("p", { class: "text-gray-600", children: "No pending player edits to moderate at this time." })] })) : (_jsx("div", { class: "space-y-6", children: playerEdits.map(edit => (_jsx("div", { class: "bg-white rounded-lg shadow overflow-hidden", children: _jsxs("div", { class: "p-6", children: [_jsxs("div", { class: "flex justify-between items-start mb-4", children: [_jsxs("div", { class: "flex-1", children: [_jsxs("h3", { class: "text-xl font-semibold text-gray-900 mb-2", children: ["Edit for: ", edit.players?.name || 'Unknown Player'] }), _jsxs("div", { class: "flex items-center space-x-4 text-sm text-gray-600", children: [_jsxs("span", { children: ["By: ", edit.user_id.substring(0, 8), "..."] }), _jsxs("span", { children: ["Submitted: ", new Date(edit.created_at).toLocaleDateString()] }), _jsx("span", { class: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800", children: edit.status })] })] }), _jsxs("div", { class: "flex items-center space-x-2", children: [_jsx("button", { onclick: `approvePlayerEdit('${edit.id}')`, class: "bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium", children: "Approve" }), _jsx("button", { onclick: `rejectPlayerEdit('${edit.id}')`, class: "bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium", children: "Reject" })] })] }), _jsxs("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("div", { children: [_jsx("h4", { class: "font-medium text-gray-900 mb-3", children: "Current Player Data" }), _jsxs("div", { class: "bg-gray-50 p-4 rounded-lg space-y-2", children: [_jsxs("div", { class: "flex justify-between", children: [_jsx("span", { class: "text-sm text-gray-600", children: "Name:" }), _jsx("span", { class: "text-sm font-medium text-gray-900", children: edit.players?.name || 'N/A' })] }), _jsxs("div", { class: "flex justify-between", children: [_jsx("span", { class: "text-sm text-gray-600", children: "Highest Rating:" }), _jsx("span", { class: "text-sm font-medium text-gray-900", children: edit.players?.highest_rating || 'N/A' })] }), _jsxs("div", { class: "flex justify-between", children: [_jsx("span", { class: "text-sm text-gray-600", children: "Active Years:" }), _jsx("span", { class: "text-sm font-medium text-gray-900", children: edit.players?.active_years || 'N/A' })] }), _jsxs("div", { class: "flex justify-between", children: [_jsx("span", { class: "text-sm text-gray-600", children: "Status:" }), _jsx("span", { class: "text-sm font-medium text-gray-900", children: edit.players?.active ? 'Active' : 'Inactive' })] })] })] }), _jsxs("div", { children: [_jsx("h4", { class: "font-medium text-gray-900 mb-3", children: "Proposed Changes" }), _jsx("div", { class: "bg-blue-50 p-4 rounded-lg space-y-2", children: Object.entries(edit.edit_data).map(([key, value]) => (_jsxs("div", { class: "flex justify-between", children: [_jsxs("span", { class: "text-sm text-gray-600 capitalize", children: [key.replace(/_/g, ' '), ":"] }), _jsx("span", { class: "text-sm font-medium text-blue-900", children: typeof value === 'boolean'
                                                                            ? value
                                                                                ? 'Active'
                                                                                : 'Inactive'
                                                                            : value || 'N/A' })] }, key))) }), _jsxs("div", { class: "mt-4", children: [_jsx("h5", { class: "text-sm font-medium text-gray-900 mb-2", children: "Summary of Changes" }), _jsx("div", { class: "text-sm text-gray-600 space-y-1", children: Object.entries(edit.edit_data).map(([key, newValue]) => {
                                                                        const currentValue = edit.players?.[key];
                                                                        if (currentValue !== newValue) {
                                                                            return (_jsxs("div", { class: "text-xs", children: [_jsx("span", { class: "font-medium", children: key.replace(/_/g, ' ') }), ":", ' ', _jsx("span", { class: "text-red-600", children: typeof currentValue === 'boolean'
                                                                                            ? currentValue
                                                                                                ? 'Active'
                                                                                                : 'Inactive'
                                                                                            : currentValue || 'N/A' }), ' ', "\u2192", _jsx("span", { class: "text-green-600", children: typeof newValue === 'boolean'
                                                                                            ? newValue
                                                                                                ? 'Active'
                                                                                                : 'Inactive'
                                                                                            : newValue || 'N/A' })] }, key));
                                                                        }
                                                                        return null;
                                                                    }) })] })] })] })] }) }, edit.id))) }))] }) }), _jsx("script", { dangerouslySetInnerHTML: { __html: getModalScript() } }), _jsx("script", { src: "/client/auth.js" }), _jsx("script", { src: "/client/forms.js" }), _jsx("script", { dangerouslySetInnerHTML: {
                    __html: `
            async function approvePlayerEdit(editId) {
              showConfirmModal(
                'Approve Player Edit', 
                'Are you sure you want to approve this player edit? The changes will be applied immediately.',
                \`performPlayerEditApproval('\${editId}')\`
              );
            }
            
            async function performPlayerEditApproval(editId) {
              try {
                const session = localStorage.getItem('session');
                if (!session) {
                  showErrorModal('Session Expired', 'Please log in again.', 'window.location.href = "/login"');
                  return;
                }
                
                const sessionData = JSON.parse(session);
                const response = await fetch('/api/admin/player-edits/' + editId + '/approve', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + sessionData.access_token,
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  showSuccessModal('Player Edit Approved', 'Player edit approved and changes applied successfully!', 'window.location.reload()');
                } else {
                  const error = await response.json();
                  showErrorModal('Approval Failed', 'Failed to approve player edit: ' + (error.error || 'Unknown error'));
                }
              } catch (error) {
                showErrorModal('Network Error', 'Error approving player edit: ' + error.message);
              }
            }
            
            async function rejectPlayerEdit(editId) {
              // Create a custom modal for rejection reason input
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
              modal.onclick = function(e) { if (e.target === this) { document.body.removeChild(this); document.body.style.overflow = ''; } };
              
              modal.innerHTML = \`
                <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                  <div class="mt-3">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </div>
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Reject Player Edit</h3>
                    <div class="mt-2 px-4 py-3">
                      <label class="block text-sm font-medium text-gray-700 mb-2">Reason for rejection (optional):</label>
                      <textarea
                        id="rejection-reason"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        rows="3"
                        placeholder="Enter reason for rejection..."
                      ></textarea>
                    </div>
                    <div class="items-center px-4 py-3">
                      <div class="flex justify-between space-x-4">
                        <button
                          onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = '';"
                          class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          onclick="performPlayerEditRejection('\${editId}', document.getElementById('rejection-reason').value); document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = '';"
                          class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Reject Edit
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              \`;
              
              document.body.appendChild(modal);
              document.body.style.overflow = 'hidden';
              document.getElementById('rejection-reason').focus();
            }
            
            async function performPlayerEditRejection(editId, reason) {
              try {
                const session = localStorage.getItem('session');
                if (!session) {
                  showErrorModal('Session Expired', 'Please log in again.', 'window.location.href = "/login"');
                  return;
                }
                
                const sessionData = JSON.parse(session);
                const response = await fetch('/api/admin/player-edits/' + editId + '/reject', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + sessionData.access_token,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ reason: reason || undefined })
                });
                
                if (response.ok) {
                  showSuccessModal('Player Edit Rejected', 'Player edit rejected successfully!', 'window.location.reload()');
                } else {
                  const error = await response.json();
                  showErrorModal('Rejection Failed', 'Failed to reject player edit: ' + (error.error || 'Unknown error'));
                }
              } catch (error) {
                showErrorModal('Network Error', 'Error rejecting player edit: ' + error.message);
              }
            }
          `,
                } })] }));
};

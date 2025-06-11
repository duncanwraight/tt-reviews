import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { PlayerEdit } from '../../types/database'
import { getModalScript } from '../ui/Modal'

interface AdminPlayerEditsPageProps {
  playerEdits: PlayerEdit[]
  total: number
}

export const AdminPlayerEditsPage: FC<AdminPlayerEditsPageProps> = ({ playerEdits, total }) => {
  return (
    <Layout title="Player Edit Moderation - TT Reviews">
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-6xl mx-auto">
          <div class="mb-8">
            <div class="flex justify-between items-center">
              <div>
                <h1 class="text-3xl font-bold text-gray-900 mb-2">Player Edit Moderation</h1>
                <p class="text-gray-600">
                  {total} pending player edit{total !== 1 ? 's' : ''} awaiting moderation
                </p>
              </div>
              <a
                href="/admin"
                class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                ← Back to Dashboard
              </a>
            </div>
          </div>

          {playerEdits.length === 0 ? (
            <div class="bg-white rounded-lg shadow p-8 text-center">
              <svg
                class="w-16 h-16 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <h3 class="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
              <p class="text-gray-600">No pending player edits to moderate at this time.</p>
            </div>
          ) : (
            <div class="space-y-6">
              {playerEdits.map(edit => (
                <div key={edit.id} class="bg-white rounded-lg shadow overflow-hidden">
                  <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                      <div class="flex-1">
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">
                          Edit for: {edit.players?.name || 'Unknown Player'}
                        </h3>
                        <div class="flex items-center space-x-4 text-sm text-gray-600">
                          <span>By: {edit.user_id.substring(0, 8)}...</span>
                          <span>Submitted: {new Date(edit.created_at).toLocaleDateString()}</span>
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            {edit.status}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center space-x-2">
                        <button
                          onclick={`approvePlayerEdit('${edit.id}')`}
                          class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onclick={`rejectPlayerEdit('${edit.id}')`}
                          class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 class="font-medium text-gray-900 mb-3">Current Player Data</h4>
                        <div class="bg-gray-50 p-4 rounded-lg space-y-2">
                          <div class="flex justify-between">
                            <span class="text-sm text-gray-600">Name:</span>
                            <span class="text-sm font-medium text-gray-900">
                              {edit.players?.name || 'N/A'}
                            </span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-sm text-gray-600">Highest Rating:</span>
                            <span class="text-sm font-medium text-gray-900">
                              {edit.players?.highest_rating || 'N/A'}
                            </span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-sm text-gray-600">Active Years:</span>
                            <span class="text-sm font-medium text-gray-900">
                              {edit.players?.active_years || 'N/A'}
                            </span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-sm text-gray-600">Status:</span>
                            <span class="text-sm font-medium text-gray-900">
                              {edit.players?.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 class="font-medium text-gray-900 mb-3">Proposed Changes</h4>
                        <div class="bg-blue-50 p-4 rounded-lg space-y-2">
                          {Object.entries(edit.edit_data).map(([key, value]) => (
                            <div key={key} class="flex justify-between">
                              <span class="text-sm text-gray-600 capitalize">
                                {key.replace(/_/g, ' ')}:
                              </span>
                              <span class="text-sm font-medium text-blue-900">
                                {typeof value === 'boolean'
                                  ? value
                                    ? 'Active'
                                    : 'Inactive'
                                  : value || 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div class="mt-4">
                          <h5 class="text-sm font-medium text-gray-900 mb-2">Summary of Changes</h5>
                          <div class="text-sm text-gray-600 space-y-1">
                            {Object.entries(edit.edit_data).map(([key, newValue]) => {
                              const currentValue = edit.players?.[key as keyof typeof edit.players]
                              if (currentValue !== newValue) {
                                return (
                                  <div key={key} class="text-xs">
                                    <span class="font-medium">{key.replace(/_/g, ' ')}</span>:{' '}
                                    <span class="text-red-600">
                                      {typeof currentValue === 'boolean'
                                        ? currentValue
                                          ? 'Active'
                                          : 'Inactive'
                                        : currentValue || 'N/A'}
                                    </span>{' '}
                                    →
                                    <span class="text-green-600">
                                      {typeof newValue === 'boolean'
                                        ? newValue
                                          ? 'Active'
                                          : 'Inactive'
                                        : newValue || 'N/A'}
                                    </span>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: getModalScript() }} />
      <script
        dangerouslySetInnerHTML={{
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
        }}
      />
    </Layout>
  )
}

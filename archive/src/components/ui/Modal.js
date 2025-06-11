import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
export const Modal = ({ id, title, message, type = 'info', confirmText = 'OK', cancelText = 'Cancel', onConfirm, onCancel, showCancel = false, }) => {
    const typeStyles = {
        success: {
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            confirmBg: 'bg-green-600 hover:bg-green-700',
            icon: (_jsx("svg", { class: "w-6 h-6", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M5 13l4 4L19 7" }) })),
        },
        error: {
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            confirmBg: 'bg-red-600 hover:bg-red-700',
            icon: (_jsx("svg", { class: "w-6 h-6", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M6 18L18 6M6 6l12 12" }) })),
        },
        warning: {
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            confirmBg: 'bg-yellow-600 hover:bg-yellow-700',
            icon: (_jsx("svg", { class: "w-6 h-6", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.994-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" }) })),
        },
        info: {
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            confirmBg: 'bg-blue-600 hover:bg-blue-700',
            icon: (_jsx("svg", { class: "w-6 h-6", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) })),
        },
    };
    const styles = typeStyles[type];
    return (_jsx("div", { id: id, class: "fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 hidden", onclick: "if (event.target === this) hideModal(this.id)", children: _jsx("div", { class: "relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white", children: _jsxs("div", { class: "mt-3 text-center", children: [_jsx("div", { class: `mx-auto flex items-center justify-center h-12 w-12 rounded-full ${styles.iconBg} mb-4`, children: _jsx("div", { class: styles.iconColor, children: styles.icon }) }), _jsx("h3", { class: "text-lg leading-6 font-medium text-gray-900 mb-2", children: title }), _jsx("div", { class: "mt-2 px-7 py-3", children: _jsx("p", { class: "text-sm text-gray-500", children: message }) }), _jsx("div", { class: "items-center px-4 py-3", children: _jsxs("div", { class: `flex ${showCancel ? 'justify-between' : 'justify-center'} space-x-4`, children: [showCancel && (_jsx("button", { id: `${id}-cancel`, onclick: onCancel || `hideModal('${id}')`, class: "px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300", children: cancelText })), _jsx("button", { id: `${id}-confirm`, onclick: onConfirm || `hideModal('${id}')`, class: `px-4 py-2 text-white text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.confirmBg}`, children: confirmText })] }) })] }) }) }));
};
// JavaScript utilities for modal management
export function getModalScript() {
    return `
    function showModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }
    
    function hideModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }
    
    function showSuccessModal(title, message, onConfirm) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
      modal.onclick = function(e) { if (e.target === this) { document.body.removeChild(this); document.body.style.overflow = ''; } };
      
      modal.innerHTML = \`
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div class="mt-3 text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-2">\${title}</h3>
            <div class="mt-2 px-7 py-3">
              <p class="text-sm text-gray-500">\${message}</p>
            </div>
            <div class="items-center px-4 py-3">
              <button
                onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = ''; \${onConfirm ? onConfirm + ';' : ''}"
                class="px-4 py-2 bg-green-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      \`;
      
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';
    }
    
    function showErrorModal(title, message, onConfirm) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
      modal.onclick = function(e) { if (e.target === this) { document.body.removeChild(this); document.body.style.overflow = ''; } };
      
      modal.innerHTML = \`
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div class="mt-3 text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-2">\${title}</h3>
            <div class="mt-2 px-7 py-3">
              <p class="text-sm text-gray-500">\${message}</p>
            </div>
            <div class="items-center px-4 py-3">
              <button
                onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = ''; \${onConfirm ? onConfirm + ';' : ''}"
                class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      \`;
      
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';
    }
    
    function showConfirmModal(title, message, onConfirm, onCancel) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
      modal.onclick = function(e) { if (e.target === this) { document.body.removeChild(this); document.body.style.overflow = ''; } };
      
      modal.innerHTML = \`
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div class="mt-3 text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
              <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.994-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-2">\${title}</h3>
            <div class="mt-2 px-7 py-3">
              <p class="text-sm text-gray-500">\${message}</p>
            </div>
            <div class="items-center px-4 py-3">
              <div class="flex justify-between space-x-4">
                <button
                  onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = ''; \${onCancel ? onCancel + ';' : ''}"
                  class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
                <button
                  onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = ''; \${onConfirm ? onConfirm + ';' : ''}"
                  class="px-4 py-2 bg-yellow-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      \`;
      
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        if (modals.length > 0) {
          const topModal = modals[modals.length - 1];
          topModal.remove();
          document.body.style.overflow = '';
        }
      }
    });
  `;
}

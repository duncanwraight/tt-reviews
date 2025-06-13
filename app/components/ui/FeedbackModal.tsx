import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface FeedbackModalProps {
  isOpen: boolean;
  type: "success" | "error" | "loading";
  title: string;
  message: string;
  autoClose?: boolean;
  autoCloseDelay?: number;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function FeedbackModal({
  isOpen,
  type,
  title,
  message,
  autoClose = true,
  autoCloseDelay = 3000,
  onClose,
  actions
}: FeedbackModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Create or get modal root
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    setModalRoot(root);
  }, []);

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && autoClose && type !== "loading" && autoCloseDelay > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, type, autoCloseDelay, onClose]);

  if (!isVisible || !modalRoot) return null;

  const typeConfig = {
    success: {
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      titleColor: "text-green-800",
      messageColor: "text-green-700",
      iconColor: "text-green-600",
      icon: "✓",
      iconBg: "bg-green-100"
    },
    error: {
      bgColor: "bg-red-50",
      borderColor: "border-red-200", 
      titleColor: "text-red-800",
      messageColor: "text-red-700",
      iconColor: "text-red-600",
      icon: "✕",
      iconBg: "bg-red-100"
    },
    loading: {
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      titleColor: "text-blue-800", 
      messageColor: "text-blue-700",
      iconColor: "text-blue-600",
      icon: "",
      iconBg: "bg-blue-100"
    }
  };

  const config = typeConfig[type];

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        zIndex: 9999
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-auto transform transition-all duration-300 ease-out">
        <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-2xl p-8`}>
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className={`${config.iconBg} w-16 h-16 rounded-full flex items-center justify-center`}>
              {type === "loading" ? (
                <div className={`w-8 h-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600`} />
              ) : (
                <span className={`${config.iconColor} text-3xl font-bold`}>
                  {config.icon}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="text-center">
            <h3 className={`${config.titleColor} text-2xl font-bold mb-3`}>
              {title}
            </h3>
            <p className={`${config.messageColor} text-lg leading-relaxed mb-6`}>
              {message}
            </p>

            {/* Actions */}
            {actions && (
              <div className="flex justify-center space-x-3">
                {actions}
              </div>
            )}

            {/* Auto-close indicator for success/error */}
            {type !== "loading" && autoClose && (
              <div className="mt-4 text-sm text-gray-500">
                This dialog will close automatically in {autoCloseDelay / 1000} seconds
              </div>
            )}
          </div>

          {/* Manual close button for errors */}
          {type === "error" && onClose && (
            <button
              onClick={() => {
                setIsVisible(false);
                onClose();
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, modalRoot);
}
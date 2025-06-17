import { useEffect, useState } from "react";

interface FeedbackMessageProps {
  type: "success" | "error" | "info" | "warning";
  title?: string;
  message: string;
  autoHide?: boolean;
  autoHideDelay?: number;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function FeedbackMessage({
  type,
  title,
  message,
  autoHide = false,
  autoHideDelay = 5000,
  onClose,
  actions,
}: FeedbackMessageProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoHide && autoHideDelay > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay, onClose]);

  const typeConfig = {
    success: {
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      textColor: "text-green-800",
      iconColor: "text-green-400",
      icon: "✓",
    },
    error: {
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      textColor: "text-red-800",
      iconColor: "text-red-400",
      icon: "✕",
    },
    warning: {
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      textColor: "text-yellow-800",
      iconColor: "text-yellow-400",
      icon: "⚠",
    },
    info: {
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      textColor: "text-blue-800",
      iconColor: "text-blue-400",
      icon: "ℹ",
    },
  };

  const config = typeConfig[type];

  if (!isVisible) return null;

  return (
    <div
      className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4 mb-4`}
    >
      <div className="flex items-start">
        <div className={`${config.iconColor} mt-0.5 mr-3 text-lg font-bold`}>
          {config.icon}
        </div>
        <div className="flex-1">
          {title && (
            <h3 className={`${config.textColor} font-semibold mb-1`}>
              {title}
            </h3>
          )}
          <p className={`${config.textColor}`}>{message}</p>
          {actions && <div className="mt-3">{actions}</div>}
        </div>
        {onClose && (
          <button
            onClick={() => {
              setIsVisible(false);
              onClose();
            }}
            className={`${config.textColor} hover:opacity-70 ml-3 text-lg`}
            aria-label="Close message"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

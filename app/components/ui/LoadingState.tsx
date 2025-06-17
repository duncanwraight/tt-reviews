interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  overlay?: boolean;
}

export function LoadingState({
  message = "Loading...",
  size = "md",
  overlay = false,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const content = (
    <div className="flex items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-purple-600`}
        role="status"
        aria-label="Loading"
      />
      <span className={`${textSizeClasses[size]} text-gray-600 font-medium`}>
        {message}
      </span>
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl">{content}</div>
      </div>
    );
  }

  return <div className="py-8">{content}</div>;
}

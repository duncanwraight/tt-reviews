import { useActionData, useNavigation } from "react-router";
import { LoadingState } from "./LoadingState";
import { FeedbackMessage } from "./FeedbackMessage";
import { useEffect } from "react";

interface RouterFormWrapperProps {
  children: (props: {
    isLoading: boolean;
    actionData: any;
  }) => React.ReactNode;
  loadingMessage?: string;
  successRedirect?: () => void;
  successRedirectDelay?: number;
  successActions?: React.ReactNode;
  className?: string;
}

export function RouterFormWrapper({
  children,
  loadingMessage = "Processing...",
  successRedirect,
  successRedirectDelay = 2000,
  successActions,
  className = ""
}: RouterFormWrapperProps) {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  // Handle success redirect
  useEffect(() => {
    if (actionData?.success && successRedirect) {
      const timer = setTimeout(successRedirect, successRedirectDelay);
      return () => clearTimeout(timer);
    }
  }, [actionData?.success, successRedirect, successRedirectDelay]);

  return (
    <div className={className}>
      {/* Success Message */}
      {actionData?.success && (
        <FeedbackMessage
          type="success"
          title="Success!"
          message={actionData.message || "Operation completed successfully"}
          autoHide={false}
          actions={successActions}
        />
      )}

      {/* Error Message */}
      {actionData?.error && (
        <FeedbackMessage
          type="error"
          title="Error"
          message={actionData.error}
        />
      )}

      {/* Loading State */}
      {isLoading && (
        <LoadingState 
          message={loadingMessage}
          size="md"
        />
      )}

      {/* Form Content */}
      {!isLoading && !actionData?.success && children({
        isLoading,
        actionData
      })}
    </div>
  );
}
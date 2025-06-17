import { useActionData, useNavigation } from "react-router";
import { FeedbackModal } from "./FeedbackModal";
import { useEffect, useState } from "react";

interface RouterFormModalWrapperProps {
  children: (props: { isLoading: boolean; actionData: any }) => React.ReactNode;
  loadingTitle?: string;
  loadingMessage?: string;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
  successRedirect?: () => void;
  successRedirectDelay?: number;
  successActions?: React.ReactNode;
  className?: string;
}

export function RouterFormModalWrapper({
  children,
  loadingTitle = "Submitting",
  loadingMessage = "Please wait while we process your request...",
  successTitle = "Success!",
  successMessage,
  errorTitle = "Submission Failed",
  successRedirect,
  successRedirectDelay = 2000,
  successActions,
  className = "",
}: RouterFormModalWrapperProps) {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [modalState, setModalState] = useState({
    isOpen: false,
    type: "loading" as "success" | "error" | "loading",
  });

  // Handle loading state
  useEffect(() => {
    if (isLoading) {
      setModalState({ isOpen: true, type: "loading" });
    }
  }, [isLoading]);

  // Handle success state
  useEffect(() => {
    if (actionData?.success && !isLoading) {
      setModalState({ isOpen: true, type: "success" });

      if (successRedirect) {
        const timer = setTimeout(() => {
          setModalState({ isOpen: false, type: "success" });
          successRedirect();
        }, successRedirectDelay);

        return () => clearTimeout(timer);
      }
    }
  }, [actionData?.success, isLoading, successRedirect, successRedirectDelay]);

  // Handle error state
  useEffect(() => {
    if (actionData?.error && !isLoading) {
      setModalState({ isOpen: true, type: "error" });
    }
  }, [actionData?.error, isLoading]);

  const closeModal = () => {
    setModalState({ isOpen: false, type: "loading" });
  };

  const getModalProps = () => {
    if (modalState.type === "loading") {
      return {
        title: loadingTitle,
        message: loadingMessage,
        autoClose: false,
      };
    }

    if (modalState.type === "success") {
      return {
        title: successTitle,
        message:
          successMessage ||
          actionData?.message ||
          "Operation completed successfully",
        autoClose: true,
        autoCloseDelay: successRedirectDelay,
        actions: successActions,
      };
    }

    if (modalState.type === "error") {
      return {
        title: errorTitle,
        message: actionData?.error || "An unexpected error occurred",
        autoClose: false,
      };
    }

    return {};
  };

  return (
    <div className={className}>
      <FeedbackModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        onClose={closeModal}
        {...getModalProps()}
      />

      {/* Form Content - hidden during loading/success states */}
      {!isLoading &&
        !actionData?.success &&
        children({
          isLoading,
          actionData,
        })}
    </div>
  );
}

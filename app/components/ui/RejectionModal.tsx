import { useState, useEffect, useCallback } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import type { RejectionCategory } from "~/lib/types";

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  submissionType: "equipment" | "player" | "player_edit";
  submissionName: string;
}

const REJECTION_CATEGORIES: Array<{ value: RejectionCategory; label: string }> = [
  { value: "duplicate", label: "Duplicate Entry" },
  { value: "insufficient_info", label: "Insufficient Information" },
  { value: "poor_image_quality", label: "Poor Image Quality" },
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "invalid_data", label: "Invalid Data" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

export function RejectionModal({
  isOpen,
  onClose,
  submissionId,
  submissionType,
  submissionName,
}: RejectionModalProps) {
  const [category, setCategory] = useState<RejectionCategory>("other");
  const [reason, setReason] = useState("");
  const navigation = useNavigation();
  const actionData = useActionData();

  // Track if we were submitting to detect successful submission
  const [wasSubmitting, setWasSubmitting] = useState(false);

  useEffect(() => {
    if (navigation.state === "submitting") {
      setWasSubmitting(true);
    } else if (navigation.state === "idle" && wasSubmitting) {
      // We were submitting and now we're idle - submission completed
      setWasSubmitting(false);
      // Use setTimeout to avoid state update during render
      setTimeout(() => {
        onClose();
        setReason(""); // Reset form
        setCategory("other");
      }, 0);
    }
  }, [navigation.state, wasSubmitting]); // Remove onClose from dependencies

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Reject Submission
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            Rejecting: <strong>{submissionName}</strong>
          </p>

          <Form method="post" className="space-y-4">
            <input type="hidden" name="submissionId" value={submissionId} />
            <input type="hidden" name="action" value="rejected" />
            
            <div className="text-left">
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Category *
              </label>
              <select
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as RejectionCategory)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {REJECTION_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-left">
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Detailed Reason *
              </label>
              <textarea
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Please provide a detailed explanation for the rejection..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reason.trim() || navigation.state === "submitting"}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {navigation.state === "submitting" ? "Rejecting..." : "Reject Submission"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
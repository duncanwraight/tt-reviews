import { useState } from "react";
import { Form, useNavigate } from "react-router";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { CSRFToken } from "~/components/ui/CSRFToken";
import { FormField } from "./fields/FormField";
import type { SubmissionConfig, FormField as FormFieldConfig } from "~/lib/submissions/registry";

interface UnifiedSubmissionFormProps {
  config: SubmissionConfig;
  csrfToken: string;
  // Server-provided options for select fields and rating categories
  fieldOptions?: Record<string, Array<{ value: string; label: string }>> & {
    rating_categories?: Array<{ name: string; label: string; description?: string; min_label?: string; max_label?: string }>;
  };
  // Pre-selected values (e.g., from URL params)
  preSelectedValues?: Record<string, any>;
  env?: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
}

export function UnifiedSubmissionForm({
  config,
  csrfToken,
  fieldOptions = {},
  preSelectedValues = {},
  env,
}: UnifiedSubmissionFormProps) {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState<Record<string, any>>(preSelectedValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (name: string, value: any) => {
    setFormValues(prev => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    config.form.fields.forEach((field: FormFieldConfig) => {
      if (field.required && !formValues[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }

      // Custom validation
      if (formValues[field.name] && field.validation) {
        const value = formValues[field.name];
        
        // Skip validation for rating_categories - they handle their own validation
        if (field.type === "rating_categories") {
          return;
        }
        
        // Text/character length validation for text fields
        if (field.type === "text" || field.type === "textarea" || field.type === "email") {
          if (field.validation.min && String(value).length < field.validation.min) {
            newErrors[field.name] = field.validation.message || `Minimum ${field.validation.min} characters required`;
          }
          
          if (field.validation.max && String(value).length > field.validation.max) {
            newErrors[field.name] = field.validation.message || `Maximum ${field.validation.max} characters allowed`;
          }
        }
        
        // Numeric validation for number fields
        if (field.type === "number" || field.type === "rating_slider") {
          const numValue = Number(value);
          if (field.validation.min && numValue < field.validation.min) {
            newErrors[field.name] = field.validation.message || `Minimum value is ${field.validation.min}`;
          }
          
          if (field.validation.max && numValue > field.validation.max) {
            newErrors[field.name] = field.validation.message || `Maximum value is ${field.validation.max}`;
          }
        }
        
        // Pattern validation for all text-based fields
        if (field.validation.pattern && !new RegExp(field.validation.pattern).test(String(value))) {
          newErrors[field.name] = field.validation.message || "Invalid format";
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!validateForm()) {
      e.preventDefault();
      return;
    }
    
    // Form is valid, let React Router handle the submission
    // Don't prevent default - let the form submit naturally
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <RouterFormModalWrapper
          loadingTitle={`Submitting ${config.displayName}`}
          loadingMessage={`Please wait while we submit your ${config.displayName.toLowerCase()} to our database...`}
          successTitle={config.form.successTitle}
          successMessage={config.form.successMessage}
          errorTitle="Submission Failed"
          successRedirect={() => navigate(config.form.redirectPath)}
          successRedirectDelay={2000}
          successActions={
            <button
              onClick={() => navigate(config.form.redirectPath)}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              View Profile
            </button>
          }
        >
          {({ isLoading }) => (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {config.form.title}
              </h2>
              
              {config.form.description && (
                <p className="text-gray-600 mb-6">
                  {config.form.description}
                </p>
              )}

              <Form
                method="post"
                encType="multipart/form-data"
                className="space-y-6"
                onSubmit={handleSubmit}
              >
                <CSRFToken token={csrfToken} />

                {/* Locked player display - shown when navigating from a player page */}
                {preSelectedValues.player_locked && preSelectedValues.player_name && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-purple-600 font-medium">Submitting equipment setup for</p>
                        <p className="text-lg font-bold text-purple-900">{preSelectedValues.player_name}</p>
                      </div>
                    </div>
                    <input type="hidden" name="player_id" value={preSelectedValues.player_id} />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {config.form.fields
                    .filter((field: FormFieldConfig) => {
                      // Hide player_id field when player is locked
                      if (field.name === "player_id" && preSelectedValues.player_locked) {
                        return false;
                      }
                      return true;
                    })
                    .map((field: FormFieldConfig) => (
                    <FormField
                      key={field.name}
                      field={field}
                      value={formValues[field.name]}
                      onChange={handleFieldChange}
                      error={errors[field.name]}
                      disabled={isLoading}
                      options={fieldOptions[field.name] || []}
                      env={env}
                      allValues={formValues}
                      ratingCategories={fieldOptions.rating_categories || []}
                    />
                  ))}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    disabled={isLoading}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Submitting..." : config.form.submitButtonText}
                  </button>
                </div>
              </Form>
            </>
          )}
        </RouterFormModalWrapper>
      </div>
    </div>
  );
}
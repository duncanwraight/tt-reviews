import { useState, useEffect } from "react";
import type { FormField as FormFieldConfig } from "~/lib/submissions/registry";
import { ImageUpload } from "~/components/ui/ImageUpload";
import { VideoSubmissionSection } from "~/components/forms/VideoSubmissionSection";
import { PlayerEquipmentSetup } from "~/components/players/PlayerEquipmentSetup";
import { RatingSlider } from "./RatingSlider";
import { RatingCategories } from "./RatingCategories";
import { createBrowserClient } from "@supabase/ssr";
import type { EquipmentOption } from "~/lib/submissions/field-loaders.server";

interface FormFieldProps {
  field: FormFieldConfig;
  value: any;
  onChange: (name: string, value: any) => void;
  error?: string;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
  env?: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
  // For dependency handling
  allValues?: Record<string, any>;
  // For rating categories
  ratingCategories?: Array<{ name: string; label: string; description?: string; min_label?: string; max_label?: string }>;
  // For equipment setup
  blades?: EquipmentOption[];
  rubbers?: EquipmentOption[];
}

export function FormField({
  field,
  value,
  onChange,
  error,
  disabled = false,
  options = [],
  env,
  allValues = {},
  ratingCategories = [],
  blades = [],
  rubbers = [],
}: FormFieldProps) {
  const [dynamicOptions, setDynamicOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingDynamicOptions, setLoadingDynamicOptions] = useState(false);

  // Handle dynamic options loading
  useEffect(() => {
    if (
      field.type === "dynamic_select" &&
      field.dynamicOptions &&
      env &&
      allValues[field.dynamicOptions.dependsOn]
    ) {
      loadDynamicOptions();
    } else if (field.type === "dynamic_select") {
      setDynamicOptions([]);
    }
  }, [field.dynamicOptions?.dependsOn, allValues[field.dynamicOptions?.dependsOn || ""]]);

  const loadDynamicOptions = async () => {
    if (!field.dynamicOptions || !env) return;

    setLoadingDynamicOptions(true);
    try {
      const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      const { data, error } = await supabase.rpc(
        field.dynamicOptions.rpcFunction,
        { [field.dynamicOptions.paramName]: allValues[field.dynamicOptions.dependsOn] }
      );

      if (error) {
        console.error("Error loading dynamic options:", error);
        setDynamicOptions([]);
      } else {
        setDynamicOptions(data || []);
      }
    } catch (error) {
      console.error("Exception loading dynamic options:", error);
      setDynamicOptions([]);
    } finally {
      setLoadingDynamicOptions(false);
    }
  };

  // Check if field should be shown based on dependencies
  const shouldShow = () => {
    if (!field.dependencies) return true;

    const dependentValue = allValues[field.dependencies.field];
    
    if (field.dependencies.showWhen) {
      const showWhen = Array.isArray(field.dependencies.showWhen) 
        ? field.dependencies.showWhen 
        : [field.dependencies.showWhen];
      return showWhen.includes(String(dependentValue));
    }
    
    if (field.dependencies.hideWhen) {
      const hideWhen = Array.isArray(field.dependencies.hideWhen) 
        ? field.dependencies.hideWhen 
        : [field.dependencies.hideWhen];
      return !hideWhen.includes(String(dependentValue));
    }
    
    return true;
  };

  if (!shouldShow()) {
    return null;
  }

  const fieldClasses = `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 ${error ? 'border-red-500' : ''}`;
  const colSpanClass = field.layout?.colSpan === 2 ? "md:col-span-2" : "md:col-span-1";

  const renderField = () => {
    switch (field.type) {
      case "hidden":
        return (
          <input
            type="hidden"
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
          />
        );

      case "text":
      case "email":
        return (
          <input
            type={field.type}
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={disabled || field.disabled}
            placeholder={field.placeholder}
            className={fieldClasses}
          />
        );

      case "number":
        return (
          <input
            type="number"
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={disabled}
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            className={fieldClasses}
          />
        );

      case "textarea":
        return (
          <textarea
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={disabled}
            placeholder={field.placeholder}
            rows={4}
            className={fieldClasses}
          />
        );

      case "select":
        const selectOptions = field.options || options;
        return (
          <select
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={disabled}
            className={fieldClasses}
          >
            <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
            {selectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "dynamic_select":
        return (
          <select
            id={field.name}
            name={field.name}
            value={value || ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={disabled || loadingDynamicOptions}
            className={fieldClasses}
          >
            <option value="">
              {loadingDynamicOptions 
                ? "Loading..." 
                : `Select ${field.label.toLowerCase()} (optional)`
              }
            </option>
            {dynamicOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={field.name}
              name={field.name}
              checked={Boolean(value)}
              onChange={(e) => onChange(field.name, e.target.checked)}
              disabled={disabled}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">{field.label}</span>
          </label>
        );

      case "image":
        return (
          <ImageUpload
            name={field.name}
            label={field.label}
            disabled={disabled}
            maxSize={10}
            preview={true}
          />
        );

      case "video_list":
        return (
          <VideoSubmissionSection
            onVideosChange={(videos) => onChange(field.name, videos)}
            showTitle={false}
          />
        );

      case "equipment_setup":
        return (
          <PlayerEquipmentSetup
            includeEquipment={Boolean(allValues.include_equipment)}
            onToggleEquipment={(include) => onChange("include_equipment", include)}
            isSubmitting={disabled}
            blades={blades}
            rubbers={rubbers}
          />
        );

      case "equipment_setup_standalone":
        return (
          <PlayerEquipmentSetup
            includeEquipment={true}
            onToggleEquipment={() => {}}
            isSubmitting={disabled}
            standalone={true}
            blades={blades}
            rubbers={rubbers}
          />
        );

      case "rating_slider":
        return (
          <RatingSlider
            name={field.name}
            label={field.label}
            value={value || field.validation?.min || 1}
            min={field.validation?.min || 1}
            max={field.validation?.max || 10}
            onChange={(name, rating) => onChange(name, rating)}
            required={field.required}
            disabled={disabled}
          />
        );

      case "rating_categories":
        return (
          <RatingCategories
            name={field.name}
            label={field.label}
            categories={ratingCategories}
            values={value || {}}
            min={field.validation?.min || 1}
            max={field.validation?.max || 10}
            onChange={(name, ratings) => onChange(name, ratings)}
            required={field.required}
            disabled={disabled}
          />
        );

      default:
        return (
          <div className="text-red-500 text-sm">
            Unsupported field type: {field.type}
          </div>
        );
    }
  };

  return (
    <div className={colSpanClass}>
      {field.type !== "checkbox" && field.type !== "image" && field.type !== "hidden" && field.type !== "rating_categories" && (
        <label
          htmlFor={field.name}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {renderField()}
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {field.type === "dynamic_select" && loadingDynamicOptions && (
        <p className="mt-1 text-xs text-gray-500">Loading options...</p>
      )}
    </div>
  );
}
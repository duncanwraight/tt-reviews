import type { CategoryOption } from "~/lib/categories.server";

interface EquipmentSpecsFieldProps {
  // Spec field metadata grouped by parent (category or subcategory) value.
  specFieldsByParent: Record<string, CategoryOption[]>;
  category?: string;
  subcategory?: string;
  // Current form values (only `spec_*` keys are read).
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
}

const PLIES_WOOD = "plies_wood";
const PLIES_COMPOSITE = "plies_composite";

const inputClasses =
  "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100";
const errorBorder = "border-red-500";

function fieldLabel(field: CategoryOption): string {
  return field.unit ? `${field.name} (${field.unit})` : field.name;
}

function ScalarInput({
  field,
  values,
  onChange,
  disabled,
  error,
}: {
  field: CategoryOption;
  values: Record<string, unknown>;
  onChange: EquipmentSpecsFieldProps["onChange"];
  disabled?: boolean;
  error?: string;
}) {
  const inputName = `spec_${field.value}`;
  const isInt = field.field_type === "int";
  // Supabase returns NULL columns as `null`, not `undefined`. Use loose
  // != null so we don't render "null–null" placeholders on fields like
  // thickness/weight where no scale hint is configured.
  const placeholder =
    field.scale_min != null && field.scale_max != null
      ? `${field.scale_min}–${field.scale_max}`
      : undefined;

  return (
    <div>
      <label
        htmlFor={inputName}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {fieldLabel(field)}
      </label>
      <input
        type="number"
        inputMode={isInt ? "numeric" : "decimal"}
        step={isInt ? 1 : "any"}
        id={inputName}
        name={inputName}
        value={String(values[inputName] ?? "")}
        onChange={e => onChange(inputName, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClasses} ${error ? errorBorder : ""}`}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function TextInput({
  field,
  values,
  onChange,
  disabled,
  error,
}: {
  field: CategoryOption;
  values: Record<string, unknown>;
  onChange: EquipmentSpecsFieldProps["onChange"];
  disabled?: boolean;
  error?: string;
}) {
  const inputName = `spec_${field.value}`;
  return (
    <div>
      <label
        htmlFor={inputName}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {fieldLabel(field)}
      </label>
      <input
        type="text"
        id={inputName}
        name={inputName}
        value={String(values[inputName] ?? "")}
        onChange={e => onChange(inputName, e.target.value)}
        disabled={disabled}
        className={`${inputClasses} ${error ? errorBorder : ""}`}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function RangeInput({
  field,
  values,
  onChange,
  disabled,
  error,
}: {
  field: CategoryOption;
  values: Record<string, unknown>;
  onChange: EquipmentSpecsFieldProps["onChange"];
  disabled?: boolean;
  error?: string;
}) {
  const minName = `spec_${field.value}_min`;
  const maxName = `spec_${field.value}_max`;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {fieldLabel(field)}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          name={minName}
          aria-label={`${field.name} minimum`}
          value={String(values[minName] ?? "")}
          onChange={e => onChange(minName, e.target.value)}
          placeholder="Min"
          disabled={disabled}
          className={`${inputClasses} ${error ? errorBorder : ""}`}
        />
        <span className="text-gray-500">–</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          name={maxName}
          aria-label={`${field.name} maximum`}
          value={String(values[maxName] ?? "")}
          onChange={e => onChange(maxName, e.target.value)}
          placeholder="Max (optional)"
          disabled={disabled}
          className={`${inputClasses} ${error ? errorBorder : ""}`}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Leave Max blank for a single value.
      </p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Plies are a paired field — one labelled control with two inputs that
// write to plies_wood + plies_composite separately. Pure-wood blades leave
// composite blank; composite blades enter both (e.g. "5+2").
function PliesPair({
  values,
  onChange,
  disabled,
  errors,
}: {
  values: Record<string, unknown>;
  onChange: EquipmentSpecsFieldProps["onChange"];
  disabled?: boolean;
  errors?: Record<string, string>;
}) {
  const woodName = `spec_${PLIES_WOOD}`;
  const compositeName = `spec_${PLIES_COMPOSITE}`;
  const woodError = errors?.[woodName];
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Plies (wood + composite)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          name={woodName}
          aria-label="Wood plies"
          value={String(values[woodName] ?? "")}
          onChange={e => onChange(woodName, e.target.value)}
          placeholder="Wood"
          disabled={disabled}
          className={`${inputClasses} ${woodError ? errorBorder : ""}`}
        />
        <span className="text-gray-500">+</span>
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          name={compositeName}
          aria-label="Composite plies"
          value={String(values[compositeName] ?? "")}
          onChange={e => onChange(compositeName, e.target.value)}
          placeholder="Composite (optional)"
          disabled={disabled}
          className={inputClasses}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Pure-wood blades: enter wood only. Composite blades: enter both (e.g. 5
        + 2).
      </p>
      {woodError && <p className="mt-1 text-sm text-red-600">{woodError}</p>}
    </div>
  );
}

export function EquipmentSpecsField({
  specFieldsByParent,
  category,
  subcategory,
  values,
  onChange,
  disabled,
  errors,
}: EquipmentSpecsFieldProps) {
  // Lookup mirrors CategoryService.getEquipmentSpecFields: subcategory takes
  // precedence, then category. Rubbers always have a subcategory; blades and
  // balls don't.
  const parentKey = subcategory || category;
  const specFields = parentKey ? specFieldsByParent[parentKey] : undefined;

  if (!parentKey) {
    return (
      <div className="md:col-span-2 rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        Select a category to enter manufacturer specifications.
      </div>
    );
  }
  if (!specFields || specFields.length === 0) {
    return (
      <div className="md:col-span-2 rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specification fields configured for this category.
      </div>
    );
  }

  const hasPliesPair =
    specFields.some(f => f.value === PLIES_WOOD) &&
    specFields.some(f => f.value === PLIES_COMPOSITE);

  return (
    <fieldset className="md:col-span-2 rounded-lg border border-gray-200 p-4">
      <legend className="px-1 text-sm font-medium text-gray-700">
        Manufacturer specifications
      </legend>
      <p className="mb-4 text-xs text-gray-500">
        Enter values as published by the manufacturer. Leave blank if unknown —
        they're optional.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {specFields.map(field => {
          if (
            hasPliesPair &&
            (field.value === PLIES_WOOD || field.value === PLIES_COMPOSITE)
          ) {
            return null;
          }
          const error = errors?.[`spec_${field.value}`];
          switch (field.field_type) {
            case "int":
            case "float":
              return (
                <ScalarInput
                  key={field.id}
                  field={field}
                  values={values}
                  onChange={onChange}
                  disabled={disabled}
                  error={error}
                />
              );
            case "range":
              return (
                <RangeInput
                  key={field.id}
                  field={field}
                  values={values}
                  onChange={onChange}
                  disabled={disabled}
                  error={error}
                />
              );
            case "text":
            default:
              return (
                <TextInput
                  key={field.id}
                  field={field}
                  values={values}
                  onChange={onChange}
                  disabled={disabled}
                  error={error}
                />
              );
          }
        })}
        {hasPliesPair && (
          <PliesPair
            values={values}
            onChange={onChange}
            disabled={disabled}
            errors={errors}
          />
        )}
      </div>
    </fieldset>
  );
}

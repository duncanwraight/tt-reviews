import type { CategoryOption } from "~/lib/categories.server";
import type { ComparisonItem } from "./comparison-types";

interface SpecsTableProps {
  items: ComparisonItem[];
  specFields: CategoryOption[];
}

const PLIES_WOOD_KEY = "plies_wood";
const PLIES_COMPOSITE_KEY = "plies_composite";

function isRangeValue(
  raw: unknown
): raw is { min: number | string; max: number | string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "min" in raw &&
    "max" in raw &&
    (raw as Record<string, unknown>).min !== null &&
    (raw as Record<string, unknown>).max !== null
  );
}

function renderScalar(raw: unknown, unit?: string): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "object") return "—";
  return unit ? `${String(raw)}${unit}` : String(raw);
}

function renderRange(raw: unknown): string {
  if (!isRangeValue(raw)) return "—";
  const min = String(raw.min);
  const max = String(raw.max);
  return min === max ? min : `${min}–${max}`;
}

function renderCell(field: CategoryOption, raw: unknown): string {
  switch (field.field_type) {
    case "range":
      return renderRange(raw);
    case "int":
    case "float":
      return renderScalar(raw, field.unit);
    case "text":
    default:
      return renderScalar(raw);
  }
}

// Plies are a paired field — wood + composite — rendered as one row.
// Wood-only blades show just the wood count; composite blades show "5+2".
function renderPliesPair(specs: Record<string, unknown>): string {
  const wood = specs[PLIES_WOOD_KEY];
  const composite = specs[PLIES_COMPOSITE_KEY];
  if (wood === null || wood === undefined || wood === "") return "—";
  if (composite === null || composite === undefined || composite === "") {
    return String(wood);
  }
  return `${wood}+${composite}`;
}

function hasAnyValue(specs: Record<string, unknown>, key: string): boolean {
  const v = specs[key];
  return v !== null && v !== undefined && v !== "";
}

export function SpecsTable({ items, specFields }: SpecsTableProps) {
  if (specFields.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specification fields configured for this category.
      </p>
    );
  }

  // Collapse the plies_wood / plies_composite pair into a single virtual row
  // so the table shows one "Plies" line instead of two.
  const collapsedFields: CategoryOption[] = [];
  let pliesWoodField: CategoryOption | null = null;
  for (const field of specFields) {
    if (field.value === PLIES_COMPOSITE_KEY) continue; // rendered alongside wood
    if (field.value === PLIES_WOOD_KEY) {
      pliesWoodField = field;
      collapsedFields.push({ ...field, name: "Plies", value: PLIES_WOOD_KEY });
      continue;
    }
    collapsedFields.push(field);
  }

  // Hide rows where every item's value is missing — keeps the table tight
  // when manufacturer data is spotty.
  const visibleRows = collapsedFields.filter(field => {
    if (field === pliesWoodField || field.value === PLIES_WOOD_KEY) {
      return items.some(
        ({ equipment }) =>
          hasAnyValue(equipment.specifications, PLIES_WOOD_KEY) ||
          hasAnyValue(equipment.specifications, PLIES_COMPOSITE_KEY)
      );
    }
    return items.some(({ equipment }) =>
      hasAnyValue(equipment.specifications, field.value)
    );
  });

  if (visibleRows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specifications available for these items.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table
        className="w-full table-fixed border-collapse text-sm"
        data-testid="specs-table"
      >
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="w-36 px-4 py-3 text-left font-medium text-gray-700 sm:w-44"
            >
              Spec
            </th>
            {items.map(({ equipment }) => (
              <th
                key={equipment.id}
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-900"
              >
                {equipment.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {visibleRows.map(field => (
            <tr key={field.id}>
              <th
                scope="row"
                className="bg-gray-50/50 px-4 py-3 text-left font-medium text-gray-700"
              >
                {field.name}
              </th>
              {items.map(({ equipment }) => (
                <td
                  key={equipment.id}
                  className="px-4 py-3 text-gray-900 break-words"
                >
                  {field.value === PLIES_WOOD_KEY
                    ? renderPliesPair(equipment.specifications)
                    : renderCell(field, equipment.specifications[field.value])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

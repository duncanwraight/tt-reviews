import type { CategoryOption } from "~/lib/categories.server";
import type { ComparisonItem } from "./comparison-types";

interface SpecsTableProps {
  items: ComparisonItem[];
  specFields: CategoryOption[];
}

function renderValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "object") return "—";
  return String(raw);
}

export function SpecsTable({ items, specFields }: SpecsTableProps) {
  if (specFields.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specification fields configured for this category.
      </p>
    );
  }

  // Hide rows where every item's value is missing — keeps the table tight
  // when manufacturer data is spotty.
  const visibleRows = specFields.filter(field =>
    items.some(({ equipment }) => {
      const value = equipment.specifications[field.value];
      return value !== null && value !== undefined && value !== "";
    })
  );

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
                  {renderValue(equipment.specifications[field.value])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

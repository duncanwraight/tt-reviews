import type { CategoryOption } from "~/lib/categories.server";
import type { EquipmentReview } from "~/lib/database/types";
import type { ComparisonItem } from "./comparison-types";

interface RatingsTableProps {
  items: ComparisonItem[];
  ratingCategories: CategoryOption[];
}

function averageFor(reviews: EquipmentReview[], key: string): number | null {
  const values = reviews
    .map(r => r.category_ratings?.[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function RatingsTable({ items, ratingCategories }: RatingsTableProps) {
  if (ratingCategories.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No rating categories configured for this equipment type.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table
        className="w-full table-fixed border-collapse text-sm"
        data-testid="ratings-table"
      >
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="w-36 px-4 py-3 text-left font-medium text-gray-700 sm:w-44"
            >
              Rating
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
          {ratingCategories.map(category => (
            <tr key={category.id}>
              <th
                scope="row"
                className="bg-gray-50/50 px-4 py-3 text-left font-medium text-gray-700"
              >
                {category.name}
              </th>
              {items.map(({ equipment, reviews }) => {
                const avg = averageFor(reviews, category.value);
                return (
                  <td key={equipment.id} className="px-4 py-3 text-gray-900">
                    {avg === null ? (
                      <span className="text-gray-500">No ratings</span>
                    ) : (
                      avg.toFixed(1)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

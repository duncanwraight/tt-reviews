import { Fragment, useMemo, useState } from "react";
import type { CategoryOption } from "~/lib/categories.server";
import { displayEquipmentName } from "~/lib/equipment";
import type { ComparisonItem } from "./comparison-types";

interface SpecsTableProps {
  items: ComparisonItem[];
  specFields: CategoryOption[];
}

const PLIES_WOOD_KEY = "plies_wood";
const PLIES_COMPOSITE_KEY = "plies_composite";

type SortDir = "asc" | "desc";
interface SortState {
  key: string;
  dir: SortDir;
}

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
// `0` composite is treated as wood-only — semantically identical to null,
// and historically some sources/extractors emitted 0 for pure-wood blades.
function renderPliesPair(specs: Record<string, unknown>): string {
  const wood = specs[PLIES_WOOD_KEY];
  const composite = specs[PLIES_COMPOSITE_KEY];
  if (wood === null || wood === undefined || wood === "") return "—";
  if (
    composite === null ||
    composite === undefined ||
    composite === "" ||
    composite === 0
  ) {
    return String(wood);
  }
  return `${wood}+${composite}`;
}

function hasAnyValue(specs: Record<string, unknown>, key: string): boolean {
  const v = specs[key];
  return v !== null && v !== undefined && v !== "";
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Returns the (primary, secondary) numeric pair used to sort one row
// across items. `null` always sorts last regardless of direction.
// Plies is a virtual row that sorts by plies_wood, then plies_composite.
function getSortKey(
  field: CategoryOption,
  specs: Record<string, unknown>
): { primary: number | null; secondary: number | null } {
  if (field.value === PLIES_WOOD_KEY) {
    return {
      primary: toNumber(specs[PLIES_WOOD_KEY]),
      secondary: toNumber(specs[PLIES_COMPOSITE_KEY]),
    };
  }
  switch (field.field_type) {
    case "int":
    case "float":
      return { primary: toNumber(specs[field.value]), secondary: null };
    case "range": {
      const v = specs[field.value];
      if (!isRangeValue(v)) return { primary: null, secondary: null };
      return { primary: toNumber(v.min), secondary: toNumber(v.max) };
    }
    default:
      return { primary: null, secondary: null };
  }
}

function isSortable(field: CategoryOption): boolean {
  if (field.value === PLIES_WOOD_KEY) return true;
  return (
    field.field_type === "int" ||
    field.field_type === "float" ||
    field.field_type === "range"
  );
}

function compareItems(
  field: CategoryOption,
  dir: SortDir,
  a: ComparisonItem,
  b: ComparisonItem
): number {
  const va = getSortKey(field, a.equipment.specifications);
  const vb = getSortKey(field, b.equipment.specifications);
  const mul = dir === "asc" ? 1 : -1;

  // Missing primary sorts last regardless of direction.
  if (va.primary === null && vb.primary === null) {
    // Both primaries missing → fall through to secondary
  } else if (va.primary === null) {
    return 1;
  } else if (vb.primary === null) {
    return -1;
  } else if (va.primary !== vb.primary) {
    return (va.primary - vb.primary) * mul;
  }

  if (va.secondary === null && vb.secondary === null) return 0;
  if (va.secondary === null) return 1;
  if (vb.secondary === null) return -1;
  return (va.secondary - vb.secondary) * mul;
}

function ariaSortFor(
  active: boolean,
  dir: SortDir
): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function SpecsTable({ items, specFields }: SpecsTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);

  // Collapse the plies_wood / plies_composite pair into a single virtual row
  // so the table shows one "Plies" line instead of two. Then drop rows where
  // every item is missing a value, keeping the table tight when data is spotty.
  const visibleRows = useMemo<CategoryOption[]>(() => {
    const collapsed: CategoryOption[] = [];
    let pliesWoodField: CategoryOption | null = null;
    for (const field of specFields) {
      if (field.value === PLIES_COMPOSITE_KEY) continue;
      if (field.value === PLIES_WOOD_KEY) {
        pliesWoodField = field;
        collapsed.push({ ...field, name: "Plies", value: PLIES_WOOD_KEY });
        continue;
      }
      collapsed.push(field);
    }
    return collapsed.filter(field => {
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
  }, [specFields, items]);

  const sortedItems = useMemo(() => {
    if (!sort) return items;
    const fieldRow = visibleRows.find(f => f.value === sort.key);
    if (!fieldRow || !isSortable(fieldRow)) return items;
    return [...items].sort((a, b) => compareItems(fieldRow, sort.dir, a, b));
  }, [items, sort, visibleRows]);

  if (specFields.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specification fields configured for this category.
      </p>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No specifications available for these items.
      </p>
    );
  }

  // Single-item view (equipment detail page) renders as a dense
  // key/value grid — the wide 2-column table wastes horizontal space
  // when the value column is just one short string per row. Using a
  // single grid template (auto/1fr repeated) keeps all labels in the
  // same column so they share a width and values sit tight beside them.
  if (items.length === 1) {
    const specs = items[0].equipment.specifications;
    return (
      <dl
        className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] lg:grid-cols-[auto_1fr_auto_1fr_auto_1fr] gap-x-6 gap-y-2 p-5 text-sm"
        data-testid="specs-table"
      >
        {visibleRows.map(field => (
          <Fragment key={field.id}>
            <dt className="text-gray-700 font-medium">{field.name}</dt>
            <dd className="text-gray-900 font-semibold break-words">
              {field.value === PLIES_WOOD_KEY
                ? renderPliesPair(specs)
                : renderCell(field, specs[field.value])}
            </dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  function onSort(key: string) {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
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
            {sortedItems.map(({ equipment }) => (
              <th
                key={equipment.id}
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-900"
                data-testid="specs-table-equipment-header"
              >
                {displayEquipmentName(equipment)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {visibleRows.map(field => {
            // Sorting only makes sense with multiple items — on the
            // single-equipment detail page the affordance is visual noise.
            const sortable = items.length >= 2 && isSortable(field);
            const active = sort?.key === field.value;
            return (
              <tr key={field.id}>
                <th
                  scope="row"
                  className="bg-gray-50/50 px-4 py-3 text-left font-medium text-gray-700"
                  aria-sort={
                    sortable
                      ? ariaSortFor(active, sort?.dir ?? "asc")
                      : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(field.value)}
                      className="flex w-full items-center justify-between gap-2 text-left text-gray-700 hover:text-gray-900"
                      data-testid={`specs-table-sort-${field.value}`}
                    >
                      <span>{field.name}</span>
                      <span aria-hidden className="text-xs text-gray-400">
                        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    field.name
                  )}
                </th>
                {sortedItems.map(({ equipment }) => (
                  <td
                    key={equipment.id}
                    className="px-4 py-3 text-gray-900 break-words"
                  >
                    {field.value === PLIES_WOOD_KEY
                      ? renderPliesPair(equipment.specifications)
                      : renderCell(
                          field,
                          equipment.specifications[field.value]
                        )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

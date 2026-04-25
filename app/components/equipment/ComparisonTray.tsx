import { Link } from "react-router";
import {
  MAX_SELECTION,
  MIN_SELECTION,
  useComparison,
} from "~/contexts/ComparisonContext";
import { LazyImage } from "~/components/ui/LazyImage";

export function ComparisonTray() {
  const {
    selectedEquipment,
    removeEquipment,
    clearSelection,
    canCompare,
    getCompareUrl,
  } = useComparison();

  if (selectedEquipment.length === 0) return null;

  const compareUrl = getCompareUrl();
  const count = selectedEquipment.length;

  return (
    <div
      data-testid="comparison-tray"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
      role="region"
      aria-label="Equipment comparison selection"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
        <span className="whitespace-nowrap text-sm font-medium text-gray-700">
          {count} of {MAX_SELECTION}
        </span>

        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {selectedEquipment.map(item => (
            <li
              key={item.id}
              className="flex min-w-0 items-center gap-2 rounded-full border border-gray-200 bg-gray-50 py-1 pl-1 pr-2 sm:pr-3"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                {item.image_key ? (
                  <LazyImage
                    src={`/api/images/${item.image_key}`}
                    alt=""
                    className="h-full w-full"
                    placeholder="skeleton"
                  />
                ) : (
                  <span className="text-sm">🏓</span>
                )}
              </span>
              <span className="max-w-[8rem] truncate text-xs text-gray-800 sm:max-w-[10rem] sm:text-sm">
                {item.name}
              </span>
              <button
                type="button"
                onClick={() => removeEquipment(item.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-700"
                aria-label={`Remove ${item.name} from comparison`}
                data-testid="comparison-tray-remove"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-gray-500 hover:text-gray-700 sm:text-sm"
          >
            Clear
          </button>
          {canCompare && compareUrl ? (
            <Link
              to={compareUrl}
              className="rounded-md bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 sm:px-4 sm:text-sm"
              data-testid="comparison-tray-compare"
            >
              Compare
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 sm:px-4 sm:text-sm"
              data-testid="comparison-tray-compare"
            >
              Compare ({count}/{MIN_SELECTION})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

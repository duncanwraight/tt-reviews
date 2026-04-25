import { Link } from "react-router";
import { LazyImage } from "~/components/ui/LazyImage";
import { ImagePlaceholder } from "~/components/ui/ImagePlaceholder";
import type { ComparisonItem } from "./comparison-types";

interface ComparisonHeaderProps {
  items: ComparisonItem[];
}

function Stars({ rating }: { rating: number }) {
  const whole = Math.floor(rating);
  return (
    <div className="flex" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < whole ? "text-yellow-400" : "text-gray-300"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function ComparisonHeader({ items }: ComparisonHeaderProps) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      }}
      data-testid="comparison-header"
    >
      {items.map(({ equipment, averageRating, reviewCount }) => (
        <article
          key={equipment.id}
          className="flex flex-col items-start gap-3 rounded-lg border border-gray-200 bg-white p-5"
        >
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg">
            {equipment.image_key ? (
              <LazyImage
                src={`/api/images/${equipment.image_key}`}
                alt={equipment.name}
                className="h-full w-full"
                placeholder="skeleton"
              />
            ) : (
              <ImagePlaceholder
                kind="equipment"
                className="h-full w-full"
                iconClassName="size-10"
              />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              <Link
                to={`/equipment/${equipment.slug}`}
                className="hover:underline"
              >
                {equipment.name}
              </Link>
            </h3>
            <p className="text-sm text-gray-600">{equipment.manufacturer}</p>
          </div>
          {reviewCount > 0 ? (
            <div className="flex items-center gap-2">
              <Stars rating={averageRating} />
              <span className="text-sm text-gray-700">
                {averageRating.toFixed(1)} ({reviewCount} review
                {reviewCount === 1 ? "" : "s"})
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-500">No reviews yet</span>
          )}
        </article>
      ))}
    </div>
  );
}

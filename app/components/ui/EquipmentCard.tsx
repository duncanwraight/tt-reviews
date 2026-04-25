import { Link } from "react-router";
import { memo, useMemo } from "react";
import { LazyImage } from "./LazyImage";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { MAX_SELECTION, useComparison } from "~/contexts/ComparisonContext";
import {
  formatSubcategoryLabel,
  getCategoryPillClasses,
  getSubcategoryPillClasses,
} from "~/lib/equipment";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
  image_key?: string;
}

interface EquipmentCardProps {
  equipment: Equipment;
  showCompareToggle?: boolean;
}

export const EquipmentCard = memo(function EquipmentCard({
  equipment,
  showCompareToggle = false,
}: EquipmentCardProps) {
  return showCompareToggle ? (
    <CompareCard equipment={equipment} />
  ) : (
    <PlainCard equipment={equipment} />
  );
});

function PlainCard({ equipment }: { equipment: Equipment }) {
  return (
    <Link
      to={`/equipment/${equipment.slug}`}
      className="group block bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-200 hover:shadow-md hover:border-gray-300 p-6"
    >
      <CardBody equipment={equipment} />
    </Link>
  );
}

function CompareCard({ equipment }: { equipment: Equipment }) {
  const { selectedEquipment, toggleEquipment } = useComparison();

  const isSelected = Boolean(
    selectedEquipment.find(item => item.id === equipment.id)
  );
  // At cap, the context evicts the oldest selection — keep the badge clickable.
  const atCap = selectedEquipment.length >= MAX_SELECTION && !isSelected;

  // Same subcategory required so ratings/spec tables share vocabulary.
  // Falls back to category when either side has no subcategory (e.g. blade, ball).
  const compatible =
    selectedEquipment.length === 0 ||
    selectedEquipment.every(selected =>
      selected.subcategory || equipment.subcategory
        ? selected.subcategory === equipment.subcategory
        : selected.category === equipment.category
    );

  const disabledReason = isSelected
    ? null
    : !compatible
      ? "Only same-subcategory items can be compared"
      : atCap
        ? `Replaces the oldest selection (max ${MAX_SELECTION})`
        : null;

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (compatible) {
      toggleEquipment(equipment);
    }
  };

  return (
    <div
      data-testid="equipment-card"
      data-slug={equipment.slug}
      className={`relative bg-white rounded-lg shadow-sm border transition-all duration-200 hover:shadow-md ${
        isSelected
          ? "border-purple-500 bg-purple-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Toggle is anchored under the image (image is 16×16 in p-6 padding,
          so its bottom is 24+64=88px from the card top). Centered with the
          image column at left 40px (24 padding + (64-32)/2). */}
      <div className="absolute top-[6rem] left-[2.5rem] z-10">
        <button
          type="button"
          onClick={handleCompareClick}
          disabled={!compatible}
          aria-pressed={isSelected}
          aria-label={
            isSelected
              ? `Remove ${equipment.name} from comparison`
              : (disabledReason ?? `Add ${equipment.name} to comparison`)
          }
          title={disabledReason ?? undefined}
          data-testid="comparison-toggle"
          data-selected={isSelected ? "true" : "false"}
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected
              ? "border-purple-500 bg-purple-500 text-white"
              : compatible
                ? atCap
                  ? "border-gray-300 bg-white hover:border-purple-500 hover:bg-purple-50 ring-1 ring-purple-200"
                  : "border-gray-300 bg-white hover:border-purple-500 hover:bg-purple-50"
                : "border-gray-200 bg-gray-100 cursor-not-allowed opacity-50"
          }`}
        >
          {isSelected ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <div className="w-3 h-3 rounded-full border border-current"></div>
          )}
        </button>
      </div>

      {/* min-h ensures very short content (blade with no rating) still
          extends past the toggle's bottom edge. */}
      <Link
        to={`/equipment/${equipment.slug}`}
        className="block p-6 min-h-[9.5rem]"
      >
        <CardBody equipment={equipment} />
      </Link>
    </div>
  );
}

function CardBody({ equipment }: { equipment: Equipment }) {
  const imageUrl = useMemo(
    () => (equipment.image_key ? `/api/images/${equipment.image_key}` : null),
    [equipment.image_key]
  );

  const categoryLabel =
    equipment.category.charAt(0).toUpperCase() + equipment.category.slice(1);
  const subcategoryLabel = equipment.subcategory
    ? formatSubcategoryLabel(equipment.subcategory)
    : null;

  return (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden">
        {imageUrl ? (
          <LazyImage
            src={imageUrl}
            alt={equipment.name}
            className="w-full h-full"
            placeholder="skeleton"
            fallbackIcon={
              <ImagePlaceholder kind="equipment" className="w-full h-full" />
            }
          />
        ) : (
          <ImagePlaceholder kind="equipment" className="w-full h-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
          {equipment.name}
        </h3>

        <div className="flex items-center gap-1.5 mb-3 text-xs">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium capitalize ${getCategoryPillClasses(equipment.category)}`}
          >
            {categoryLabel}
          </span>
          {subcategoryLabel && (
            <>
              <span className="text-gray-400" aria-hidden="true">
                •
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium ${getSubcategoryPillClasses()}`}
              >
                {subcategoryLabel}
              </span>
            </>
          )}
        </div>

        {equipment.rating && equipment.reviewCount ? (
          <div className="flex items-center space-x-2">
            <div className="flex">
              {Array.from({ length: 5 }, (_, i) => (
                <svg
                  key={i}
                  className={`w-4 h-4 ${
                    i < Math.floor(equipment.rating!)
                      ? "text-yellow-400"
                      : "text-gray-300"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-sm text-gray-600">
              {equipment.rating.toFixed(1)} ({equipment.reviewCount}{" "}
              {equipment.reviewCount === 1 ? "review" : "reviews"})
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

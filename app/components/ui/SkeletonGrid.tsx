import { memo } from "react";
import { SkeletonCard } from "./SkeletonCard";

interface SkeletonGridProps {
  count?: number;
  type?: "equipment" | "player" | "review";
  showImages?: boolean;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export const SkeletonGrid = memo(function SkeletonGrid({
  count = 6,
  type = "equipment",
  showImages = true,
  columns = 3,
  className = "",
}: SkeletonGridProps) {
  const getGridClassName = () => {
    switch (columns) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-1 md:grid-cols-2";
      case 3:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
      default:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    }
  };

  return (
    <div className={`grid ${getGridClassName()} gap-6 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard
          key={index}
          type={type}
          showImage={showImages}
        />
      ))}
    </div>
  );
});
import { memo } from "react";
import { ImageSkeleton } from "./ImageSkeleton";

interface SkeletonCardProps {
  type?: "equipment" | "player" | "review";
  showImage?: boolean;
  className?: string;
}

export const SkeletonCard = memo(function SkeletonCard({
  type = "equipment",
  showImage = true,
  className = "",
}: SkeletonCardProps) {
  const getImageAspectRatio = () => {
    switch (type) {
      case "player":
        return "square";
      case "review":
        return "video";
      case "equipment":
      default:
        return "landscape";
    }
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-100 animate-pulse ${className}`}
    >
      <div className="p-6">
        {/* Image skeleton */}
        {showImage && (
          <div className="mb-4">
            <ImageSkeleton
              aspectRatio={getImageAspectRatio()}
              className="w-full"
              showIcon={false}
            />
          </div>
        )}

        {/* Header badges */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-gray-200 rounded-full w-20"></div>
          {type === "equipment" && (
            <div className="h-5 bg-gray-200 rounded w-16"></div>
          )}
        </div>

        {/* Title */}
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>

        {/* Subtitle */}
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>

        {/* Content lines */}
        {type === "review" && (
          <>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6 mb-4"></div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    </div>
  );
});

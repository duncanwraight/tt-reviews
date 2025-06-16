import { memo } from "react";

interface ImageSkeletonProps {
  className?: string;
  aspectRatio?: "square" | "video" | "portrait" | "landscape";
  showIcon?: boolean;
}

export const ImageSkeleton = memo(function ImageSkeleton({
  className = "",
  aspectRatio = "landscape",
  showIcon = true,
}: ImageSkeletonProps) {
  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case "square":
        return "aspect-square";
      case "video":
        return "aspect-video";
      case "portrait":
        return "aspect-[3/4]";
      case "landscape":
      default:
        return "aspect-[4/3]";
    }
  };

  return (
    <div className={`${getAspectRatioClass()} ${className}`}>
      <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
        {showIcon && (
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </div>
    </div>
  );
});
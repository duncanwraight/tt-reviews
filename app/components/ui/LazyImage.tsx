import { useState, useRef, useEffect, memo } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  // Extra classes applied to the inner <img>. Use this for things like
  // `object-top` that need to live on the image element itself rather
  // than the wrapper div (which is what `className` decorates).
  imgClassName?: string;
  // Choose between cover (default — crop to fill, used for player
  // headshots) and contain (no crop, used for product photos that
  // shouldn't lose whitespace). Tailwind orders both `object-*`
  // utilities equally so an imgClassName override is unreliable —
  // hence the explicit prop.
  objectFit?: "cover" | "contain";
  fallbackIcon?: React.ReactNode;
  placeholder?: "blur" | "skeleton";
  onLoad?: () => void;
  onError?: () => void;
}

export const LazyImage = memo(function LazyImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  objectFit = "cover",
  fallbackIcon,
  placeholder = "skeleton",
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "50px", // Start loading 50px before the image enters viewport
        threshold: 0.1,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true); // Consider it "loaded" to hide skeleton
    onError?.();
  };

  const showSkeleton = !isLoaded && !hasError;
  const showFallback = hasError || (!src && !isLoaded);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Skeleton Loading State */}
      {showSkeleton && placeholder === "skeleton" && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg" />
      )}

      {/* Blur Loading State */}
      {showSkeleton && placeholder === "blur" && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer rounded-lg" />
      )}

      {/* Actual Image */}
      {isInView && src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`
            transition-opacity duration-300 rounded-lg
            ${isLoaded ? "opacity-100" : "opacity-0"}
            ${hasError ? "hidden" : objectFit === "contain" ? "w-full h-full object-contain" : "w-full h-full object-cover"}
            ${imgClassName}
          `}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}

      {/* Fallback Content */}
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
          {fallbackIcon || (
            <div className="text-gray-400 text-center">
              <svg
                className="w-12 h-12 mx-auto mb-2"
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
              <span className="text-sm text-gray-500">Image unavailable</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

interface RatingStarsProps {
  rating: number;
  count?: number;
  size?: 'small' | 'medium' | 'large';
  showCount?: boolean;
}

export function RatingStars({ rating, count, size = 'medium', showCount = true }: RatingStarsProps) {
  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg'
  };

  const starCount = 5;
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className={`flex items-center ${sizeClasses[size]}`}>
      <div className="flex items-center text-yellow-400 mr-2">
        {Array.from({ length: starCount }, (_, i) => {
          if (i < fullStars) {
            return <span key={i}>★</span>;
          } else if (i === fullStars && hasHalfStar) {
            return <span key={i}>☆</span>; // Half star representation
          } else {
            return <span key={i} className="text-gray-300">★</span>;
          }
        })}
      </div>
      {showCount && count !== undefined && (
        <span className="text-gray-600 text-sm">
          {rating.toFixed(1)} ({count} {count === 1 ? 'review' : 'reviews'})
        </span>
      )}
    </div>
  );
}
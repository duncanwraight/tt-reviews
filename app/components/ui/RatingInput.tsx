import { useState } from "react";

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  max?: number;
  min?: number;
  step?: number;
}

export function RatingInput({
  value,
  onChange,
  disabled = false,
  max = 10,
  min = 1,
  step = 1,
}: RatingInputProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const handleClick = (rating: number) => {
    if (!disabled) {
      onChange(rating);
    }
  };

  const handleMouseEnter = (rating: number) => {
    if (!disabled) {
      setHoveredValue(rating);
    }
  };

  const handleMouseLeave = () => {
    if (!disabled) {
      setHoveredValue(null);
    }
  };

  const displayValue = hoveredValue !== null ? hoveredValue : value;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => {
        const rating = i + 1;
        const isActive = rating <= displayValue;
        const isClickable = !disabled;

        return (
          <button
            key={rating}
            type="button"
            onClick={() => handleClick(rating)}
            onMouseEnter={() => handleMouseEnter(rating)}
            onMouseLeave={handleMouseLeave}
            disabled={disabled}
            className={`
              w-8 h-8 rounded-full border-2 text-sm font-semibold transition-all duration-150
              ${
                isActive
                  ? "bg-purple-600 border-purple-600 text-white"
                  : "bg-white border-gray-300 text-gray-400 hover:border-purple-400"
              }
              ${
                isClickable
                  ? "hover:scale-110 cursor-pointer"
                  : "cursor-not-allowed opacity-50"
              }
            `}
          >
            {rating}
          </button>
        );
      })}
    </div>
  );
}

import { useState } from "react";

interface RatingSliderProps {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (name: string, value: number) => void;
  required?: boolean;
  disabled?: boolean;
}

export function RatingSlider({
  name,
  label,
  value,
  min,
  max,
  onChange,
  required = false,
  disabled = false,
}: RatingSliderProps) {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    onChange(name, newValue);
  };

  const getRatingText = (rating: number) => {
    if (rating === 0) return "No rating";
    if (rating <= 2) return "Poor";
    if (rating <= 4) return "Fair";
    if (rating <= 6) return "Good";
    if (rating <= 8) return "Very Good";
    return "Excellent";
  };

  const getRatingColor = (rating: number) => {
    if (rating === 0) return "text-gray-400";
    if (rating <= 2) return "text-red-500";
    if (rating <= 4) return "text-orange-500";
    if (rating <= 6) return "text-yellow-500";
    if (rating <= 8) return "text-blue-500";
    return "text-green-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-xl font-bold text-gray-900">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className={`text-2xl font-bold ${getRatingColor(value)}`}>
          {value}/{max} - {getRatingText(value)}
        </div>
      </div>

      {/* Slider Input */}
      <div className="space-y-3">
        <input
          type="range"
          id={name}
          name={name}
          min={min}
          max={max}
          value={value || min}
          onChange={handleSliderChange}
          disabled={disabled}
          className={`w-full h-3 rounded-lg appearance-none cursor-pointer ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          } bg-gray-200 
          [&::-webkit-slider-thumb]:appearance-none 
          [&::-webkit-slider-thumb]:w-6 
          [&::-webkit-slider-thumb]:h-6 
          [&::-webkit-slider-thumb]:rounded-full 
          [&::-webkit-slider-thumb]:bg-purple-600
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:hover:bg-purple-700
          [&::-moz-range-thumb]:w-6 
          [&::-moz-range-thumb]:h-6 
          [&::-moz-range-thumb]:rounded-full 
          [&::-moz-range-thumb]:bg-purple-600
          [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:shadow-lg`}
        />
        
        {/* Scale Labels */}
        <div className="flex justify-between text-sm text-gray-500 px-1">
          <span>{min}</span>
          <span className="text-center font-medium">Rating Scale</span>
          <span>{max}</span>
        </div>
      </div>

      {/* Hidden input for form submission */}
      <input
        type="hidden"
        name={name}
        value={value || ""}
      />
    </div>
  );
}
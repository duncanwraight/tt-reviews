import { useCallback, useMemo } from "react";

interface RatingCategory {
  name: string;
  label: string;
  description?: string;
}

interface RatingCategoriesProps {
  name: string;
  label: string;
  categories: RatingCategory[];
  values: Record<string, number>;
  min: number;
  max: number;
  onChange: (name: string, categoryRatings: Record<string, number>) => void;
  required?: boolean;
  disabled?: boolean;
}

export function RatingCategories({
  name,
  label,
  categories,
  values,
  min,
  max,
  onChange,
  required = false,
  disabled = false,
}: RatingCategoriesProps) {
  // DEBUG: Log on every render
  console.log('[RatingCategories] Render with values:', values);

  // Ensure we have a valid values object with defaults for all categories
  const currentRatings = useMemo(() => {
    console.log('[RatingCategories] useMemo recalculating currentRatings from values:', values);
    const ratings: Record<string, number> = {};
    categories.forEach(cat => {
      ratings[cat.name] = values[cat.name] ?? min;
    });
    return ratings;
  }, [categories, values, min]);

  const handleSliderChange = useCallback((categoryName: string, newValue: number) => {
    // DEBUG: Log what's happening
    console.log('[RatingCategories] handleSliderChange called:', {
      categoryName,
      newValue,
      currentRatings,
      valuesFromProps: values
    });

    // Create new values object with the updated category
    const newRatings = {
      ...currentRatings,
      [categoryName]: newValue
    };

    console.log('[RatingCategories] Calling onChange with:', { name, newRatings });

    // Notify parent
    onChange(name, newRatings);
  }, [name, currentRatings, onChange, values]);

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

  // Calculate overall score
  const overallScore = useMemo(() => {
    const ratedCategories = categories.filter(cat => currentRatings[cat.name] > 0);
    if (ratedCategories.length === 0) return 0;

    const totalScore = ratedCategories.reduce((sum, cat) => sum + (currentRatings[cat.name] || 0), 0);
    return Math.round((totalScore / ratedCategories.length) * 10) / 10;
  }, [categories, currentRatings]);


  if (!categories || categories.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <span className="text-yellow-600">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Rating categories not available
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Equipment-specific rating categories require database setup. Using overall rating only for now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-2xl font-bold text-gray-900">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </h3>
      </div>

      {/* Overall Score Display */}
      {overallScore > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Overall Score</h4>
              <p className="text-sm text-gray-600">Average of all rated categories</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-purple-600">
                {overallScore}/10
              </div>
              <div className="text-sm text-gray-500">
                Based on {categories.filter(cat => currentRatings[cat.name] > 0).length} categories
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {categories.map((category, index) => {
          const currentValue = currentRatings[category.name] ?? min;
          const sliderId = `rating_${name}_${category.name}_${index}`;

          return (
            <div key={sliderId} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label htmlFor={sliderId} className="block text-xl font-bold text-gray-900">
                    {category.label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className={`text-2xl font-bold ${getRatingColor(currentValue)}`}>
                    {currentValue}/{max} - {getRatingText(currentValue)}
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="range"
                    id={sliderId}
                    key={`slider_${sliderId}`}
                    value={currentValue}
                    min={min}
                    max={max}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      handleSliderChange(category.name, newValue);
                    }}
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
                  
                  <div className="flex justify-between text-sm text-gray-500 px-1">
                    <span>{min}</span>
                    <span className="text-center font-medium">Rating Scale</span>
                    <span>{max}</span>
                  </div>
                </div>
              </div>
              
              {category.description && (
                <p className="text-sm text-gray-600 mt-3 italic leading-relaxed">
                  {category.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden inputs for form submission */}
      {categories.map((category, index) => (
        <input
          key={`hidden_input_${category.name}_${index}`}
          type="hidden"
          name={`rating_${category.name}`}
          value={currentRatings[category.name] || ""}
        />
      ))}

      {/* Summary hidden input */}
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(currentRatings)}
      />
      
      {/* Overall score hidden input */}
      <input
        type="hidden"
        name="overall_rating"
        value={overallScore}
      />
    </div>
  );
}
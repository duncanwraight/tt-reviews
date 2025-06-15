import { Link } from "react-router";
import type { Equipment } from "~/lib/types";

interface ComparisonConclusionProps {
  equipment1: Equipment;
  equipment2: Equipment;
  averageRating1?: number | null;
  averageRating2?: number | null;
  reviews1: any[];
  reviews2: any[];
}

export function ComparisonConclusion({ 
  equipment1, 
  equipment2, 
  averageRating1,
  averageRating2,
  reviews1,
  reviews2
}: ComparisonConclusionProps) {
  
  // Generate comparison insights
  const generateInsights = () => {
    const insights = [];
    
    // Rating comparison
    if (averageRating1 && averageRating2) {
      if (Math.abs(averageRating1 - averageRating2) < 0.2) {
        insights.push(`Both ${equipment1.name} and ${equipment2.name} receive similar community ratings, with less than 0.2 points difference.`);
      } else if (averageRating1 > averageRating2) {
        insights.push(`${equipment1.name} has a higher community rating (${averageRating1.toFixed(1)}) compared to ${equipment2.name} (${averageRating2.toFixed(1)}).`);
      } else {
        insights.push(`${equipment2.name} has a higher community rating (${averageRating2.toFixed(1)}) compared to ${equipment1.name} (${averageRating1.toFixed(1)}).`);
      }
    }
    
    // Review count comparison
    if (reviews1.length > reviews2.length * 2) {
      insights.push(`${equipment1.name} has significantly more community reviews (${reviews1.length} vs ${reviews2.length}), suggesting higher market adoption or longer availability.`);
    } else if (reviews2.length > reviews1.length * 2) {
      insights.push(`${equipment2.name} has significantly more community reviews (${reviews2.length} vs ${reviews1.length}), suggesting higher market adoption or longer availability.`);
    }
    
    // Manufacturer comparison
    if (equipment1.manufacturer !== equipment2.manufacturer) {
      insights.push(`This comparison showcases different manufacturer approaches: ${equipment1.manufacturer} vs ${equipment2.manufacturer}.`);
    }
    
    // Subcategory insights
    if (equipment1.subcategory && equipment2.subcategory && equipment1.subcategory !== equipment2.subcategory) {
      insights.push(`These represent different playing styles: ${equipment1.subcategory} vs ${equipment2.subcategory}.`);
    }
    
    return insights;
  };

  const insights = generateInsights();

  return (
    <div className="mt-8 space-y-6">
      {/* Comparison Summary */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          Comparison Summary
        </h3>
        
        {insights.length > 0 ? (
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <p key={index} className="text-gray-700 leading-relaxed">
                • {insight}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-gray-700">
            Both equipment pieces offer unique characteristics suitable for different playing styles and preferences. 
            Consider your skill level, playing style, and specific needs when making your choice.
          </p>
        )}
      </div>

      {/* Recommendation Engine */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          Which Should You Choose?
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-4 border-l-4 border-purple-500">
            <h4 className="font-semibold text-purple-900 mb-2">
              Choose {equipment1.name} if:
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              {averageRating1 && averageRating2 && averageRating1 > averageRating2 && (
                <li>• You prefer equipment with higher community ratings</li>
              )}
              {reviews1.length > reviews2.length && (
                <li>• You want equipment with more user feedback available</li>
              )}
              <li>• You prefer {equipment1.manufacturer} products</li>
              {equipment1.subcategory && (
                <li>• Your playing style suits {equipment1.subcategory} characteristics</li>
              )}
            </ul>
          </div>
          
          <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
            <h4 className="font-semibold text-blue-900 mb-2">
              Choose {equipment2.name} if:
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              {averageRating1 && averageRating2 && averageRating2 > averageRating1 && (
                <li>• You prefer equipment with higher community ratings</li>
              )}
              {reviews2.length > reviews1.length && (
                <li>• You want equipment with more user feedback available</li>
              )}
              <li>• You prefer {equipment2.manufacturer} products</li>
              {equipment2.subcategory && (
                <li>• Your playing style suits {equipment2.subcategory} characteristics</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Related Comparisons */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          You Might Also Compare
        </h3>
        
        <div className="text-center text-gray-600">
          <p className="mb-4">
            Explore more {equipment1.category} comparisons to find your perfect match.
          </p>
          <Link
            to={`/equipment?category=${equipment1.category}`}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
          >
            Browse All {equipment1.category}s
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
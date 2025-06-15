import { Link } from "react-router";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
}

interface ComparisonSectionProps {
  currentEquipment: Equipment;
  similarEquipment: Equipment[];
}

export function ComparisonSection({ currentEquipment, similarEquipment }: ComparisonSectionProps) {
  if (similarEquipment.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">
          Compare Equipment
        </h3>
        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      
      <p className="text-gray-600 mb-4">
        See how the {currentEquipment.name} compares to other popular {currentEquipment.category}s
      </p>

      <div className="space-y-3">
        {similarEquipment.slice(0, 4).map((equipment) => (
          <Link
            key={equipment.id}
            to={`/equipment/compare/${currentEquipment.slug}-vs-${equipment.slug}`}
            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
          >
            <div className="flex-1">
              <div className="font-medium text-gray-900 group-hover:text-purple-700">
                {currentEquipment.name} vs {equipment.name}
              </div>
              <div className="text-sm text-gray-500">
                {currentEquipment.manufacturer} vs {equipment.manufacturer}
              </div>
            </div>
            <div className="flex items-center text-purple-600 group-hover:text-purple-700">
              <span className="text-sm font-medium mr-2">Compare</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {similarEquipment.length > 4 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to={`/equipment?category=${currentEquipment.category}`}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Browse all {currentEquipment.category}s to compare →
          </Link>
        </div>
      )}
    </div>
  );
}
import { Link } from "react-router";
import { useComparison } from "~/contexts/ComparisonContext";

export function ComparisonBar() {
  const { 
    isCompareMode, 
    selectedEquipment, 
    toggleCompareMode, 
    clearSelection, 
    canCompare, 
    getCompareUrl 
  } = useComparison();

  // Show minimal version when not active, full version when active
  if (!isCompareMode && selectedEquipment.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={toggleCompareMode}
          className="flex items-center px-4 py-3 bg-purple-600 text-white rounded-lg shadow-lg hover:bg-purple-700 transition-all duration-200 hover:scale-105"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Compare
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleCompareMode}
              className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                isCompareMode
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {isCompareMode ? 'Exit Compare' : 'Compare Equipment'}
            </button>

            {isCompareMode && (
              <div className="text-sm text-gray-600">
                Select {2 - selectedEquipment.length} more equipment to compare
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {selectedEquipment.length > 0 && (
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-600">
                  Selected: {selectedEquipment.length}/2
                </div>
                
                <div className="flex space-x-2">
                  {selectedEquipment.map((equipment) => (
                    <div
                      key={equipment.id}
                      className="flex items-center bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm"
                    >
                      <span className="truncate max-w-32">{equipment.name}</span>
                      <button
                        onClick={() => clearSelection()}
                        className="ml-2 text-purple-600 hover:text-purple-800"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {canCompare && (
                  <Link
                    to={getCompareUrl()!}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Compare Now
                  </Link>
                )}

                <button
                  onClick={clearSelection}
                  className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
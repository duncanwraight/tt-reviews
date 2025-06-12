interface PlayerEquipmentSetupProps {
  includeEquipment: boolean;
  onToggleEquipment: (include: boolean) => void;
  isSubmitting: boolean;
}

const SOURCE_TYPES = [
  { value: 'interview', label: 'Interview' },
  { value: 'video', label: 'Video' },
  { value: 'tournament_footage', label: 'Tournament Footage' },
  { value: 'official_website', label: 'Official Website' },
];

export function PlayerEquipmentSetup({ 
  includeEquipment, 
  onToggleEquipment, 
  isSubmitting 
}: PlayerEquipmentSetupProps) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <div className="flex items-center mb-4">
        <input
          type="checkbox"
          id="include_equipment"
          checked={includeEquipment}
          onChange={(e) => onToggleEquipment(e.target.checked)}
          disabled={isSubmitting}
          className="mr-3 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
        />
        <label htmlFor="include_equipment" className="text-lg font-semibold text-gray-900">
          Include Equipment Setup (Optional)
        </label>
      </div>
      
      {includeEquipment && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Year */}
            <div>
              <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <input
                type="number"
                id="year"
                name="year"
                min="1970"
                max={new Date().getFullYear()}
                defaultValue={new Date().getFullYear()}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            {/* Blade */}
            <div>
              <label htmlFor="blade_name" className="block text-sm font-medium text-gray-700 mb-2">
                Blade
              </label>
              <input
                type="text"
                id="blade_name"
                name="blade_name"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="e.g., Butterfly Viscaria"
              />
            </div>
          </div>

          {/* Forehand Setup */}
          <RubberSetup 
            side="forehand" 
            label="Forehand" 
            isSubmitting={isSubmitting} 
          />

          {/* Backhand Setup */}
          <RubberSetup 
            side="backhand" 
            label="Backhand" 
            isSubmitting={isSubmitting} 
          />

          {/* Source Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="source_type" className="block text-sm font-medium text-gray-700 mb-2">
                Source Type
              </label>
              <select
                id="source_type"
                name="source_type"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">Select source type</option>
                {SOURCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="source_url" className="block text-sm font-medium text-gray-700 mb-2">
                Source URL
              </label>
              <input
                type="url"
                id="source_url"
                name="source_url"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RubberSetupProps {
  side: 'forehand' | 'backhand';
  label: string;
  isSubmitting: boolean;
}

function RubberSetup({ side, label, isSubmitting }: RubberSetupProps) {
  return (
    <div>
      <h4 className="text-md font-medium text-gray-900 mb-3">{label}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor={`${side}_rubber_name`} className="block text-sm font-medium text-gray-700 mb-2">
            Rubber
          </label>
          <input
            type="text"
            id={`${side}_rubber_name`}
            name={`${side}_rubber_name`}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
            placeholder={side === 'forehand' ? 'e.g., Hurricane 3' : 'e.g., Tenergy 64'}
          />
        </div>
        <div>
          <label htmlFor={`${side}_thickness`} className="block text-sm font-medium text-gray-700 mb-2">
            Thickness
          </label>
          <input
            type="text"
            id={`${side}_thickness`}
            name={`${side}_thickness`}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="e.g., 2.1mm"
          />
        </div>
        <div>
          <label htmlFor={`${side}_color`} className="block text-sm font-medium text-gray-700 mb-2">
            Color
          </label>
          <select
            id={`${side}_color`}
            name={`${side}_color`}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          >
            <option value="">Select color</option>
            <option value="red">Red</option>
            <option value="black">Black</option>
          </select>
        </div>
      </div>
    </div>
  );
}
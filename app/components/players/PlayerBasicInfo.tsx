interface PlayerBasicInfoProps {
  isSubmitting: boolean;
}

const COUNTRIES = [
  { code: "CHN", name: "China" },
  { code: "JPN", name: "Japan" },
  { code: "GER", name: "Germany" },
  { code: "KOR", name: "South Korea" },
  { code: "SWE", name: "Sweden" },
  { code: "FRA", name: "France" },
  { code: "HKG", name: "Hong Kong" },
  { code: "TPE", name: "Chinese Taipei" },
  { code: "SGP", name: "Singapore" },
  { code: "USA", name: "United States" },
  { code: "BRA", name: "Brazil" },
  { code: "EGY", name: "Egypt" },
  { code: "NIG", name: "Nigeria" },
  { code: "IND", name: "India" },
  { code: "AUS", name: "Australia" },
  { code: "POL", name: "Poland" },
  { code: "ROU", name: "Romania" },
  { code: "AUT", name: "Austria" },
  { code: "DEN", name: "Denmark" },
  { code: "CRO", name: "Croatia" },
  { code: "SVK", name: "Slovakia" },
];

const PLAYING_STYLES = [
  { value: "attacker", label: "Attacker" },
  { value: "all_rounder", label: "All-Rounder" },
  { value: "defender", label: "Defender" },
  { value: "counter_attacker", label: "Counter-Attacker" },
  { value: "chopper", label: "Chopper" },
  { value: "unknown", label: "Unknown" },
];

export function PlayerBasicInfo({ isSubmitting }: PlayerBasicInfoProps) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Player Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Player Name */}
        <div className="md:col-span-2">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Player Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="e.g., Ma Long"
          />
        </div>

        {/* Highest Rating */}
        <div>
          <label
            htmlFor="highest_rating"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Highest Rating
          </label>
          <input
            type="text"
            id="highest_rating"
            name="highest_rating"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="e.g., 3000+"
          />
        </div>

        {/* Active Years */}
        <div>
          <label
            htmlFor="active_years"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Active Years
          </label>
          <input
            type="text"
            id="active_years"
            name="active_years"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="e.g., 2005-present"
          />
        </div>

        {/* Playing Style */}
        <div>
          <label
            htmlFor="playing_style"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Playing Style
          </label>
          <select
            id="playing_style"
            name="playing_style"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          >
            <option value="">Select playing style</option>
            {PLAYING_STYLES.map(style => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </div>

        {/* Birth Country */}
        <div>
          <label
            htmlFor="birth_country"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Birth Country
          </label>
          <select
            id="birth_country"
            name="birth_country"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          >
            <option value="">Select country</option>
            {COUNTRIES.map(country => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        {/* Represents */}
        <div>
          <label
            htmlFor="represents"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Represents
          </label>
          <select
            id="represents"
            name="represents"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          >
            <option value="">Select country</option>
            {COUNTRIES.map(country => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";

interface CountrySearchProps {
  countries: string[];
  currentCountry?: string;
  buildFilterUrl: (filters: { country?: string }) => string;
}

const COUNTRY_NAMES: Record<string, string> = {
  AUT: "Austria",
  BRA: "Brazil",
  CHN: "China",
  DEN: "Denmark",
  EGY: "Egypt",
  FRA: "France",
  GER: "Germany",
  JPN: "Japan",
  KOR: "South Korea",
  MAC: "Macau",
  PUR: "Puerto Rico",
  ROU: "Romania",
  SLO: "Slovenia",
  SWE: "Sweden",
  TPE: "Chinese Taipei",
  UKR: "Ukraine",
  USA: "United States",
  SGP: "Singapore",
  HKG: "Hong Kong",
  GBR: "Great Britain",
  BEL: "Belgium",
  NLD: "Netherlands",
  CZE: "Czech Republic",
  POL: "Poland",
  HUN: "Hungary",
  BLR: "Belarus",
  RUS: "Russia",
  PRT: "Portugal",
  ESP: "Spain",
  ITA: "Italy",
  HRV: "Croatia",
  LUX: "Luxembourg",
  IND: "India",
  AUS: "Australia",
  CAN: "Canada",
  NGA: "Nigeria",
  IRN: "Iran",
  THA: "Thailand",
  MYS: "Malaysia",
  IDN: "Indonesia",
  PHL: "Philippines",
  PRK: "North Korea",
};

export function CountrySearch({
  countries,
  currentCountry,
  buildFilterUrl,
}: CountrySearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [filteredCountries, setFilteredCountries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTerm.length === 0) {
      setFilteredCountries([]);
      setIsOpen(false);
      return;
    }

    const filtered = countries
      .filter(country => {
        const countryName = COUNTRY_NAMES[country] || country;
        return (
          countryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          country.toLowerCase().includes(searchTerm.toLowerCase())
        );
      })
      .slice(0, 8); // Limit to 8 results

    setFilteredCountries(filtered);
    setIsOpen(filtered.length > 0);
  }, [searchTerm, countries]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (country: string) => {
    setSearchTerm("");
    setIsOpen(false);
    // Navigation will be handled by the Link component
  };

  return (
    <div className="space-y-3">
      <div className="relative" ref={dropdownRef}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search country..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onFocus={() => {
            if (filteredCountries.length > 0) {
              setIsOpen(true);
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
          🔍
        </div>

        {isOpen && filteredCountries.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {filteredCountries.map(country => (
              <Link
                key={country}
                to={buildFilterUrl({ country })}
                onClick={() => handleSelect(country)}
                className="block px-3 py-2 hover:bg-purple-50 hover:text-purple-800 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <span className="font-medium">
                  {COUNTRY_NAMES[country] || country}
                </span>
                {COUNTRY_NAMES[country] && (
                  <span className="text-gray-500 text-sm ml-2">
                    ({country})
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {currentCountry && (
        <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
          <span className="text-sm text-purple-800 font-medium">
            Filtering: {COUNTRY_NAMES[currentCountry] || currentCountry}
          </span>
          <Link
            to={buildFilterUrl({ country: undefined })}
            className="text-purple-600 hover:text-purple-800 text-sm"
          >
            Clear
          </Link>
        </div>
      )}
    </div>
  );
}

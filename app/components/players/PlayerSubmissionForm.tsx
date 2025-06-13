import { useState } from "react";
import { Form, useNavigate } from "react-router";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { ImageUpload } from "~/components/ui/ImageUpload";
import { PlayerEquipmentSetup } from "./PlayerEquipmentSetup";

interface PlayerSubmissionFormProps {}

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

export function PlayerSubmissionForm(): JSX.Element {
  const navigate = useNavigate();
  const [includeEquipment, setIncludeEquipment] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <RouterFormModalWrapper
          loadingTitle="Submitting Player"
          loadingMessage="Please wait while we submit your player to our database..."
          successTitle="Player Submitted!"
          successMessage="Your player has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!"
          errorTitle="Submission Failed"
          successRedirect={() => navigate("/players")}
          successRedirectDelay={3000}
          successActions={
            <button
              onClick={() => navigate("/players")}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              View Players List
            </button>
          }
        >
          {({ isLoading }) => (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Submit New Player
              </h2>

              <Form method="post" encType="multipart/form-data" className="space-y-8">
                {/* Hidden field for equipment toggle */}
                <input
                  type="hidden"
                  name="include_equipment"
                  value={includeEquipment.toString()}
                />
          {/* Player Information */}
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
                  disabled={isLoading}
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
                  disabled={isLoading}
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
                  disabled={isLoading}
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
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Select playing style</option>
                  {PLAYING_STYLES.map((style) => (
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
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((country) => (
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
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Player Image */}
              <div className="md:col-span-2">
                <ImageUpload
                  name="image"
                  label="Player Photo (Optional)"
                  disabled={isLoading}
                  maxSize={10}
                  preview={true}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Upload a professional photo of the player. This helps with identification and provides a better user experience.
                </p>
              </div>
            </div>
          </div>

                {/* Equipment Setup Section */}
                <PlayerEquipmentSetup
                  includeEquipment={includeEquipment}
                  onToggleEquipment={setIncludeEquipment}
                  isSubmitting={isLoading}
                />

                {/* Submit Button */}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => navigate("/players")}
                    disabled={isLoading}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Submitting..." : "Submit Player"}
                  </button>
                </div>
              </Form>
            </>
          )}
        </RouterFormModalWrapper>
      </div>
    </div>
  );
}

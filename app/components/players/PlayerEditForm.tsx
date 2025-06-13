import { useState } from "react";
import { Form, useNavigate, useActionData } from "react-router";
import type { Player } from "~/lib/database.server";

interface PlayerEditFormProps {
  player: Player;
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
  userId: string;
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

export function PlayerEditForm({ player, env, userId }: PlayerEditFormProps) {
  const navigate = useNavigate();
  const actionData = useActionData() as { error?: string; success?: boolean; message?: string } | undefined;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
  };

  // Handle success redirect
  if (actionData?.success) {
    setTimeout(() => {
      navigate(`/players/${player.slug}`);
    }, 2000);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Current Information Display */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Current Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Name:</span>
            <span className="ml-2 text-gray-900">{player.name}</span>
          </div>
          {player.highest_rating && (
            <div>
              <span className="font-medium text-gray-700">Highest Rating:</span>
              <span className="ml-2 text-gray-900">
                {player.highest_rating}
              </span>
            </div>
          )}
          {player.active_years && (
            <div>
              <span className="font-medium text-gray-700">Active Years:</span>
              <span className="ml-2 text-gray-900">{player.active_years}</span>
            </div>
          )}
          {player.playing_style && (
            <div>
              <span className="font-medium text-gray-700">Playing Style:</span>
              <span className="ml-2 text-gray-900">
                {player.playing_style
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
            </div>
          )}
          {player.birth_country && (
            <div>
              <span className="font-medium text-gray-700">Birth Country:</span>
              <span className="ml-2 text-gray-900">{player.birth_country}</span>
            </div>
          )}
          {player.represents && (
            <div>
              <span className="font-medium text-gray-700">Represents:</span>
              <span className="ml-2 text-gray-900">{player.represents}</span>
            </div>
          )}
        </div>
      </div>

      {/* Guidelines */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-amber-900 mb-3">
          Update Guidelines
        </h3>
        <ul className="space-y-2 text-amber-800">
          <li className="flex items-start">
            <span className="text-amber-600 mr-2">•</span>
            Profile updates should be based on official information
          </li>
          <li className="flex items-start">
            <span className="text-amber-600 mr-2">•</span>
            All changes will be reviewed before being published
          </li>
          <li className="flex items-start">
            <span className="text-amber-600 mr-2">•</span>
            Please only submit verified and up-to-date information
          </li>
        </ul>
      </div>

      {/* Edit Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Edit Player Information
        </h2>

        {actionData?.error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {actionData.error}
          </div>
        )}

        {actionData?.success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {actionData.message || "Player edit submitted successfully!"}
          </div>
        )}

        <Form onSubmit={handleSubmit} method="post" className="space-y-6">
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
                defaultValue={player.name}
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
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
                defaultValue={player.highest_rating || ""}
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
                defaultValue={player.active_years || ""}
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
                defaultValue={player.playing_style || ""}
                disabled={isSubmitting}
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
                defaultValue={player.birth_country || ""}
                disabled={isSubmitting}
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
                defaultValue={player.represents || ""}
                disabled={isSubmitting}
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
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => navigate(`/players/${player.slug}`)}
              disabled={isSubmitting}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Changes"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

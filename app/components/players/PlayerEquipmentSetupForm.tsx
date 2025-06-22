import { Form, useNavigate } from "react-router";
import { useState } from "react";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { CSRFToken } from "~/components/ui/CSRFToken";
import type { Player, Equipment } from "~/lib/database.server";

interface PlayerEquipmentSetupFormProps {
  player: Player;
  blades: Equipment[];
  rubbers: Equipment[];
  csrfToken: string;
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
}

export function PlayerEquipmentSetupForm({
  player,
  blades,
  rubbers,
  csrfToken,
  env,
}: PlayerEquipmentSetupFormProps) {
  const navigate = useNavigate();
  const [forehandColor, setForehandColor] = useState<string>("");
  const [backhandColor, setBackhandColor] = useState<string>("");

  const handleForehandColorChange = (value: string) => {
    setForehandColor(value);
    if (value === "red") {
      setBackhandColor("black");
    } else if (value === "black") {
      setBackhandColor("red");
    }
  };

  const handleBackhandColorChange = (value: string) => {
    setBackhandColor(value);
    if (value === "red") {
      setForehandColor("black");
    } else if (value === "black") {
      setForehandColor("red");
    }
  };

  return (
    <RouterFormModalWrapper
      loadingTitle="Submitting Equipment Setup"
      loadingMessage="Please wait while we submit the equipment setup..."
      successTitle="Equipment Setup Submitted!"
      successMessage="The equipment setup has been submitted and will be reviewed by our team."
      successRedirect={() => navigate(`/players/${player.slug}`)}
      successRedirectDelay={2000}
    >
      {({ isLoading }) => (
        <Form method="POST" className="space-y-8">
          {/* CSRF Token */}
          <CSRFToken token={csrfToken} />

          {/* Player Info Header */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {player.name}
                </h3>
                <p className="text-gray-600">
                  {player.birth_country && `${player.birth_country} • `}
                  {player.playing_style &&
                    player.playing_style
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, l => l.toUpperCase())}
                </p>
              </div>
            </div>
          </div>

          {/* Year */}
          <div className="space-y-3">
            <label
              htmlFor="year"
              className="block text-sm font-semibold text-gray-900"
            >
              Year <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="year"
              name="year"
              required
              min="1950"
              max={new Date().getFullYear()}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
              placeholder="e.g., 2023"
            />
            <p className="text-sm text-gray-500">
              The year this equipment setup was used
            </p>
          </div>

          {/* Blade Selection */}
          <div className="space-y-3">
            <label
              htmlFor="blade_id"
              className="block text-sm font-semibold text-gray-900"
            >
              Blade <span className="text-red-500">*</span>
            </label>
            <select
              id="blade_id"
              name="blade_id"
              required
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
            >
              <option value="">Select a blade</option>
              {blades.map(blade => (
                <option key={blade.id} value={blade.id}>
                  {blade.manufacturer} {blade.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rubber Configuration */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Rubber Configuration
            </h3>

            {/* Forehand Rubber */}
            <div className="space-y-4">
              <h4 className="text-md font-medium text-gray-800">Forehand Side</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="forehand_rubber_id"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Rubber
                  </label>
                  <select
                    id="forehand_rubber_id"
                    name="forehand_rubber_id"
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select forehand rubber</option>
                    {rubbers.map(rubber => (
                      <option key={rubber.id} value={rubber.id}>
                        {rubber.manufacturer} {rubber.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="forehand_thickness"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Thickness
                  </label>
                  <select
                    id="forehand_thickness"
                    name="forehand_thickness"
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select thickness</option>
                    <option value="1.5mm">1.5mm</option>
                    <option value="1.8mm">1.8mm</option>
                    <option value="2.0mm">2.0mm</option>
                    <option value="2.1mm">2.1mm</option>
                    <option value="max">Max</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="forehand_color"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Color
                  </label>
                  <select
                    id="forehand_color"
                    name="forehand_color"
                    value={forehandColor}
                    onChange={e => handleForehandColorChange(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select color</option>
                    <option value="red">Red</option>
                    <option value="black">Black</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Backhand Rubber */}
            <div className="space-y-4">
              <h4 className="text-md font-medium text-gray-800">Backhand Side</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="backhand_rubber_id"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Rubber
                  </label>
                  <select
                    id="backhand_rubber_id"
                    name="backhand_rubber_id"
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select backhand rubber</option>
                    {rubbers.map(rubber => (
                      <option key={rubber.id} value={rubber.id}>
                        {rubber.manufacturer} {rubber.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="backhand_thickness"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Thickness
                  </label>
                  <select
                    id="backhand_thickness"
                    name="backhand_thickness"
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select thickness</option>
                    <option value="1.5mm">1.5mm</option>
                    <option value="1.8mm">1.8mm</option>
                    <option value="2.0mm">2.0mm</option>
                    <option value="2.1mm">2.1mm</option>
                    <option value="max">Max</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="backhand_color"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Color
                  </label>
                  <select
                    id="backhand_color"
                    name="backhand_color"
                    value={backhandColor}
                    onChange={e => handleBackhandColorChange(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  >
                    <option value="">Select color</option>
                    <option value="red">Red</option>
                    <option value="black">Black</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Source Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Source Information (Optional)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="source_type"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Source Type
                </label>
                <select
                  id="source_type"
                  name="source_type"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="">Select source type</option>
                  <option value="official_website">Official Website</option>
                  <option value="interview">Interview</option>
                  <option value="tournament_footage">Tournament Footage</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="source_url"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Source URL
                </label>
                <input
                  type="url"
                  id="source_url"
                  name="source_url"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-6">
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate(`/players/${player.slug}`)}
                disabled={isLoading}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
              >
                {isLoading ? "Submitting..." : "Submit Equipment Setup"}
              </button>
            </div>
          </div>
        </Form>
      )}
    </RouterFormModalWrapper>
  );
}
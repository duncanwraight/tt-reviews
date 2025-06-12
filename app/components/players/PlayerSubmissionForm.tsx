import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useNavigate } from "react-router";

interface PlayerSubmissionFormProps {
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
  userId: string;
}

const COUNTRIES = [
  { code: 'CHN', name: 'China' },
  { code: 'JPN', name: 'Japan' },
  { code: 'GER', name: 'Germany' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'FRA', name: 'France' },
  { code: 'HKG', name: 'Hong Kong' },
  { code: 'TPE', name: 'Chinese Taipei' },
  { code: 'SGP', name: 'Singapore' },
  { code: 'USA', name: 'United States' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'EGY', name: 'Egypt' },
  { code: 'NIG', name: 'Nigeria' },
  { code: 'IND', name: 'India' },
  { code: 'AUS', name: 'Australia' },
  { code: 'POL', name: 'Poland' },
  { code: 'ROU', name: 'Romania' },
  { code: 'AUT', name: 'Austria' },
  { code: 'DEN', name: 'Denmark' },
  { code: 'CRO', name: 'Croatia' },
  { code: 'SVK', name: 'Slovakia' },
];

const PLAYING_STYLES = [
  { value: 'attacker', label: 'Attacker' },
  { value: 'all_rounder', label: 'All-Rounder' },
  { value: 'defender', label: 'Defender' },
  { value: 'counter_attacker', label: 'Counter-Attacker' },
  { value: 'chopper', label: 'Chopper' },
  { value: 'unknown', label: 'Unknown' },
];

const SOURCE_TYPES = [
  { value: 'interview', label: 'Interview' },
  { value: 'video', label: 'Video' },
  { value: 'tournament_footage', label: 'Tournament Footage' },
  { value: 'official_website', label: 'Official Website' },
];

export function PlayerSubmissionForm({ env, userId }: PlayerSubmissionFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [includeEquipment, setIncludeEquipment] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;

    // Validate required fields
    if (!name) {
      setError('Player name is required.');
      setIsSubmitting(false);
      return;
    }

    // Build player submission data
    const submission: any = {
      user_id: userId,
      name: name.trim(),
      highest_rating: formData.get('highest_rating') || null,
      active_years: formData.get('active_years') || null,
      playing_style: formData.get('playing_style') || null,
      birth_country: formData.get('birth_country') || null,
      represents: formData.get('represents') || null,
    };

    // Add equipment setup if included
    if (includeEquipment) {
      const equipmentSetup: any = {};
      
      const year = formData.get('year');
      if (year) equipmentSetup.year = parseInt(year as string);
      
      const bladeValue = formData.get('blade_name');
      if (bladeValue) equipmentSetup.blade_name = bladeValue;
      
      const forehandRubber = formData.get('forehand_rubber_name');
      if (forehandRubber) {
        equipmentSetup.forehand_rubber_name = forehandRubber;
        equipmentSetup.forehand_thickness = formData.get('forehand_thickness') || null;
        equipmentSetup.forehand_color = formData.get('forehand_color') || null;
      }
      
      const backhandRubber = formData.get('backhand_rubber_name');
      if (backhandRubber) {
        equipmentSetup.backhand_rubber_name = backhandRubber;
        equipmentSetup.backhand_thickness = formData.get('backhand_thickness') || null;
        equipmentSetup.backhand_color = formData.get('backhand_color') || null;
      }
      
      const sourceType = formData.get('source_type');
      if (sourceType) equipmentSetup.source_type = sourceType;
      
      const sourceUrl = formData.get('source_url');
      if (sourceUrl) equipmentSetup.source_url = sourceUrl;
      
      if (Object.keys(equipmentSetup).length > 0) {
        submission.equipment_setup = equipmentSetup;
      }
    }

    try {
      const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      
      const { data, error: submitError } = await supabase
        .from('player_submissions')
        .insert(submission)
        .select()
        .single();

      if (submitError) {
        throw submitError;
      }

      setSuccess('Player submitted successfully! It will be reviewed by our team.');
      
      // Reset form
      (event.target as HTMLFormElement).reset();
      setIncludeEquipment(false);
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/players');
      }, 2000);

    } catch (err) {
      console.error('Submission error:', err);
      setError('Failed to submit player. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit New Player</h2>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Player Information */}
          <div className="border-b border-gray-200 pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Player Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Player Name */}
              <div className="md:col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="highest_rating" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="active_years" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="playing_style" className="block text-sm font-medium text-gray-700 mb-2">
                  Playing Style
                </label>
                <select
                  id="playing_style"
                  name="playing_style"
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
                <label htmlFor="birth_country" className="block text-sm font-medium text-gray-700 mb-2">
                  Birth Country
                </label>
                <select
                  id="birth_country"
                  name="birth_country"
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
                <label htmlFor="represents" className="block text-sm font-medium text-gray-700 mb-2">
                  Represents
                </label>
                <select
                  id="represents"
                  name="represents"
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
          </div>

          {/* Equipment Setup Section */}
          <div className="border-b border-gray-200 pb-6">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="include_equipment"
                checked={includeEquipment}
                onChange={(e) => setIncludeEquipment(e.target.checked)}
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
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Forehand</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="forehand_rubber_name" className="block text-sm font-medium text-gray-700 mb-2">
                        Rubber
                      </label>
                      <input
                        type="text"
                        id="forehand_rubber_name"
                        name="forehand_rubber_name"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        placeholder="e.g., Hurricane 3"
                      />
                    </div>
                    <div>
                      <label htmlFor="forehand_thickness" className="block text-sm font-medium text-gray-700 mb-2">
                        Thickness
                      </label>
                      <input
                        type="text"
                        id="forehand_thickness"
                        name="forehand_thickness"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        placeholder="e.g., 2.1mm"
                      />
                    </div>
                    <div>
                      <label htmlFor="forehand_color" className="block text-sm font-medium text-gray-700 mb-2">
                        Color
                      </label>
                      <select
                        id="forehand_color"
                        name="forehand_color"
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

                {/* Backhand Setup */}
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Backhand</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="backhand_rubber_name" className="block text-sm font-medium text-gray-700 mb-2">
                        Rubber
                      </label>
                      <input
                        type="text"
                        id="backhand_rubber_name"
                        name="backhand_rubber_name"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        placeholder="e.g., Tenergy 64"
                      />
                    </div>
                    <div>
                      <label htmlFor="backhand_thickness" className="block text-sm font-medium text-gray-700 mb-2">
                        Thickness
                      </label>
                      <input
                        type="text"
                        id="backhand_thickness"
                        name="backhand_thickness"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        placeholder="e.g., 2.1mm"
                      />
                    </div>
                    <div>
                      <label htmlFor="backhand_color" className="block text-sm font-medium text-gray-700 mb-2">
                        Color
                      </label>
                      <select
                        id="backhand_color"
                        name="backhand_color"
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

          {/* Submit Button */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => navigate('/players')}
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
              {isSubmitting ? 'Submitting...' : 'Submit Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
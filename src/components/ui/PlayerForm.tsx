import { FC } from 'hono/jsx'
import { PlayerFormProps } from '../../types/components'

export const PlayerForm: FC<PlayerFormProps> = ({ player, isEditing = false, className = '' }) => {
  const formTitle = isEditing ? 'Update Player Profile' : 'Submit New Player'
  const submitText = isEditing ? 'Update Player' : 'Submit Player'

  return (
    <div class={`player-form bg-white rounded-lg border border-gray-200 ${className}`}>
      <div class="form-header p-6 border-b border-gray-200">
        <h2 class="text-2xl font-bold text-gray-900">{formTitle}</h2>
        <p class="text-gray-600 mt-2">
          {isEditing
            ? 'Update the player information and equipment details'
            : 'Add a new professional table tennis player to our database'}
        </p>
      </div>

      <form
        class="p-6"
        id="player-form"
        method="post"
        action={isEditing ? '/api/players/update' : '/api/players/submit'}
        data-mode={isEditing ? 'update' : 'submit'}
        onsubmit={`handlePlayerSubmit(event, '${isEditing ? 'update' : 'submit'}')`}
      >
        <div class="form-sections space-y-8">
          {/* Basic Information */}
          <section class="basic-info">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="player-name">
                  Player Name *
                </label>
                <input
                  type="text"
                  id="player-name"
                  name="name"
                  value={player?.name || ''}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Ma Long, Fan Zhendong"
                  required
                />
              </div>

              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="highest-rating">
                  Highest Rating
                </label>
                <input
                  type="text"
                  id="highest-rating"
                  name="highest_rating"
                  value={player?.highest_rating || ''}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., 3000+ ITTF Rating"
                />
              </div>

              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="active-years">
                  Active Years
                </label>
                <input
                  type="text"
                  id="active-years"
                  name="active_years"
                  value={player?.active_years || ''}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., 2005-2024, 2010-present"
                />
              </div>

              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="active-status">
                  Status
                </label>
                <select
                  id="active-status"
                  name="active"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="true" selected={player?.active !== false}>
                    Active
                  </option>
                  <option value="false" selected={player?.active === false}>
                    Retired
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* Equipment Setup */}
          <section class="equipment-setup">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Current Equipment Setup</h3>
            <p class="text-sm text-gray-600 mb-4">
              Add the player's current or most recent equipment setup
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Blade Selection */}
              <div class="form-group col-span-full">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="blade">
                  Blade
                </label>
                <input
                  type="text"
                  id="blade"
                  name="blade_name"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Butterfly Viscaria, DHS Hurricane Long 5"
                />
              </div>

              {/* Forehand Rubber */}
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="forehand-rubber">
                  Forehand Rubber
                </label>
                <input
                  type="text"
                  id="forehand-rubber"
                  name="forehand_rubber_name"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Tenergy 05, DHS Hurricane 3"
                />

                <div class="rubber-details grid grid-cols-2 gap-2 mt-2">
                  <select
                    name="forehand_thickness"
                    class="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Thickness</option>
                    <option value="1.5mm">1.5mm</option>
                    <option value="1.8mm">1.8mm</option>
                    <option value="2.0mm">2.0mm</option>
                    <option value="max">Max</option>
                  </select>
                  <select
                    name="forehand_color"
                    class="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Color</option>
                    <option value="red">Red</option>
                    <option value="black">Black</option>
                  </select>
                </div>
              </div>

              {/* Backhand Rubber */}
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="backhand-rubber">
                  Backhand Rubber
                </label>
                <input
                  type="text"
                  id="backhand-rubber"
                  name="backhand_rubber_name"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Dignics 05, Rozena"
                />

                <div class="rubber-details grid grid-cols-2 gap-2 mt-2">
                  <select
                    name="backhand_thickness"
                    class="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Thickness</option>
                    <option value="1.5mm">1.5mm</option>
                    <option value="1.8mm">1.8mm</option>
                    <option value="2.0mm">2.0mm</option>
                    <option value="max">Max</option>
                  </select>
                  <select
                    name="backhand_color"
                    class="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Color</option>
                    <option value="red">Red</option>
                    <option value="black">Black</option>
                  </select>
                </div>
              </div>

              {/* Setup Year and Source */}
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="setup-year">
                  Year
                </label>
                <input
                  type="number"
                  id="setup-year"
                  name="year"
                  min="2000"
                  max="2025"
                  value={new Date().getFullYear()}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="source-type">
                  Source Type
                </label>
                <select
                  id="source-type"
                  name="source_type"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select source type</option>
                  <option value="interview">Interview</option>
                  <option value="video">Video</option>
                  <option value="tournament_footage">Tournament Footage</option>
                  <option value="official_website">Official Website</option>
                </select>
              </div>

              <div class="form-group col-span-full">
                <label class="block text-sm font-medium text-gray-700 mb-2" for="source-url">
                  Source URL (optional)
                </label>
                <input
                  type="url"
                  id="source-url"
                  name="source_url"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="https://..."
                />
              </div>
            </div>
          </section>
        </div>

        {/* Form Actions */}
        <div class="form-actions flex justify-end space-x-4 mt-8 pt-6 border-t border-gray-200">
          <button
            type="button"
            class="px-6 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {submitText}
          </button>
        </div>
      </form>
    </div>
  )
}

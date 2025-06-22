import { Link } from "react-router";
import type { PlayerEquipmentSetup } from "~/lib/database.server";

interface EquipmentTimelineProps {
  equipmentSetups: (PlayerEquipmentSetup & {
    blade?: { name: string; slug: string };
    forehand_rubber?: { name: string; slug: string };
    backhand_rubber?: { name: string; slug: string };
  })[];
  playerId: string; // This is actually the player slug
  playerName: string;
  showAddButton?: boolean;
}

interface EquipmentItemProps {
  label: string;
  item?: { name: string; slug: string } | null;
  thickness?: string;
  color?: "red" | "black";
}

function EquipmentItem({ label, item, thickness, color }: EquipmentItemProps) {
  if (!item) return null;

  const displayName =
    thickness || color
      ? `${item.name} (${color || ""}${thickness ? `, ${thickness}` : ""})`
      : item.name;

  return (
    <div className="equipment-item flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-100">
      <span className="equipment-label font-medium text-gray-700">
        {label}:
      </span>
      <Link
        to={`/equipment/${item.slug}`}
        className="equipment-name font-semibold text-purple-600 hover:text-purple-800 hover:underline"
      >
        {displayName}
      </Link>
    </div>
  );
}

function TimelineItem({
  setup,
}: {
  setup: EquipmentTimelineProps["equipmentSetups"][0];
}) {
  return (
    <div className="timeline-item relative mb-8 bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <div className="timeline-marker absolute -left-7 top-6 w-3 h-3 bg-purple-600 rounded-full border-2 border-white"></div>

      <div className="timeline-year text-xl font-semibold text-purple-600 mb-4">
        {setup.year}
      </div>

      <div className="equipment-setup space-y-3">
        <EquipmentItem label="Blade" item={setup.blade} />
        <EquipmentItem
          label="Forehand"
          item={setup.forehand_rubber}
          thickness={setup.forehand_thickness}
          color={setup.forehand_color}
        />
        <EquipmentItem
          label="Backhand"
          item={setup.backhand_rubber}
          thickness={setup.backhand_thickness}
          color={setup.backhand_color}
        />
      </div>

      {setup.source_url && (
        <a
          href={setup.source_url}
          className="source-link inline-block mt-4 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source: {setup.source_type?.replace("_", " ") || "External link"}
        </a>
      )}
    </div>
  );
}

export function EquipmentTimeline({
  equipmentSetups,
  playerId,
  playerName,
  showAddButton = false,
}: EquipmentTimelineProps) {
  // Show empty state if no equipment setups
  if (equipmentSetups.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="timeline-header flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Equipment Timeline</h2>
          {showAddButton && (
            <Link
              to={`/players/edit/${playerId}#add-equipment`}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Add Equipment Setup
            </Link>
          )}
        </div>

        <div className="empty-state text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Equipment Information Available
          </h3>
          <p className="text-gray-600 mb-6">
            {playerName}'s equipment hasn't been submitted yet.
          </p>
          <Link
            to={`/players/edit/${playerId}#add-equipment`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            Submit Equipment Information
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Timeline Header with Add Equipment Button */}
      <div className="timeline-header flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Equipment Timeline</h2>
        {showAddButton && (
          <Link
            to={`/players/edit/${playerId}#add-equipment`}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Add Equipment Setup
          </Link>
        )}
      </div>

      <div className="timeline relative pl-8">
        <div className="timeline-line absolute left-3 top-0 bottom-0 w-0.5 bg-gray-300"></div>

        {equipmentSetups.map((setup, index) => (
          <TimelineItem key={setup.id || index} setup={setup} />
        ))}
      </div>
    </div>
  );
}

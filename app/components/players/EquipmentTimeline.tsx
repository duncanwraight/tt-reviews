import { Link } from "react-router";
import { PlayerEquipmentSetup } from "~/lib/types";

interface EquipmentTimelineProps {
  equipmentSetups: (PlayerEquipmentSetup & {
    blade?: { name: string; slug: string };
    forehand_rubber?: { name: string; slug: string };
    backhand_rubber?: { name: string; slug: string };
  })[];
  playerId: string;
  playerName: string;
  showAddButton?: boolean;
}

interface EquipmentItemProps {
  label: string;
  item?: { name: string; slug: string } | null;
  thickness?: string;
  color?: 'red' | 'black';
}

function EquipmentItem({ label, item, thickness, color }: EquipmentItemProps) {
  if (!item) return null;

  const displayName = thickness || color 
    ? `${item.name} (${color || ''}${thickness ? `, ${thickness}` : ''})`
    : item.name;

  return (
    <div className="equipment-item flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-100">
      <span className="equipment-label font-medium text-gray-700">{label}:</span>
      <Link
        to={`/equipment/${item.slug}`}
        className="equipment-name font-semibold text-purple-600 hover:text-purple-800 hover:underline"
      >
        {displayName}
      </Link>
    </div>
  );
}

function TimelineItem({ setup }: { setup: EquipmentTimelineProps['equipmentSetups'][0] }) {
  return (
    <div className="timeline-item relative mb-8 bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <div className="timeline-marker absolute -left-7 top-6 w-3 h-3 bg-purple-600 rounded-full border-2 border-white"></div>

      <div className="timeline-year text-xl font-semibold text-purple-600 mb-4">{setup.year}</div>

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
          Source: {setup.source_type?.replace('_', ' ') || 'External link'}
        </a>
      )}
    </div>
  );
}

export function EquipmentTimeline({ equipmentSetups, playerId, playerName, showAddButton = false }: EquipmentTimelineProps) {
  // Mock data if no setups provided
  const mockSetups = equipmentSetups.length
    ? equipmentSetups
    : [
        {
          id: 'mock-1',
          player_id: playerId,
          year: 2019,
          blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
          forehand_rubber: { name: 'Butterfly Tenergy 64', slug: 'butterfly-tenergy-64' },
          forehand_thickness: 'max',
          forehand_color: 'red' as const,
          backhand_rubber: { name: 'Victas Curl P3aV', slug: 'victas-curl-p3av' },
          backhand_thickness: '1.5mm',
          backhand_color: 'black' as const,
          source_url: 'https://youtube.com/watch',
          source_type: 'video' as const,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'mock-2',
          player_id: playerId,
          year: 2007,
          blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
          forehand_rubber: { name: 'Butterfly Tenergy 64', slug: 'butterfly-tenergy-64' },
          forehand_thickness: 'max',
          forehand_color: 'red' as const,
          backhand_rubber: { name: 'TSP Curl P1-R', slug: 'tsp-curl-p1-r' },
          backhand_thickness: '1.5mm',
          backhand_color: 'black' as const,
          source_url: 'https://example.com/interview',
          source_type: 'interview' as const,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Timeline Header with Add Equipment Button */}
      <div className="timeline-header flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Equipment Timeline</h2>
        {showAddButton && (
          <a
            href={`/players/${playerId}/edit#add-equipment`}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Add Equipment Setup
          </a>
        )}
      </div>

      <div className="timeline relative pl-8">
        <div className="timeline-line absolute left-3 top-0 bottom-0 w-0.5 bg-gray-300"></div>

        {mockSetups.map((setup, index) => (
          <TimelineItem key={setup.id || index} setup={setup} />
        ))}
      </div>
    </div>
  );
}
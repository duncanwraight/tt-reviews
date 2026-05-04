import { Link } from "react-router";
import { displayEquipmentName } from "~/lib/equipment";
import type { ComparisonItem } from "./comparison-types";

interface ProUsageSidebarProps {
  items: ComparisonItem[];
}

const VISIBLE_CAP = 5;

export function ProUsageSidebar({ items }: ProUsageSidebarProps) {
  return (
    <div
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
      data-testid="pro-usage-sidebar"
    >
      {items.map(({ equipment, usedByPlayers }) => {
        const visible = usedByPlayers.slice(0, VISIBLE_CAP);
        const overflow = usedByPlayers.length - visible.length;
        return (
          <section key={equipment.id} className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">
              {displayEquipmentName(equipment)}
            </h3>
            {usedByPlayers.length === 0 ? (
              <p className="text-sm text-gray-500">No tracked pro users.</p>
            ) : (
              <ul className="space-y-1">
                {visible.map(player => (
                  <li key={player.id}>
                    <Link
                      to={`/players/${player.slug}`}
                      className="text-sm text-purple-700 hover:underline"
                    >
                      {player.name}
                    </Link>
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="text-sm text-gray-500">+{overflow} more</li>
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

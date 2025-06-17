import type { Equipment, Player } from "~/lib/database.server";
import { ResultCard } from "./ResultCard";

interface ResultsSectionProps {
  title: string;
  items: Equipment[] | Player[];
  type: "equipment" | "players";
  icon: string;
}

export function ResultsSection({
  title,
  items,
  type,
  icon,
}: ResultsSectionProps) {
  return (
    <div className="results-section">
      <div className="section-header flex items-center gap-3 mb-6">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {items.length} result{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="results-grid grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map(item => (
          <ResultCard key={item.id || item.slug} item={item} type={type} />
        ))}
      </div>
    </div>
  );
}

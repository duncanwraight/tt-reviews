import { useState } from "react";
import { EquipmentTimeline } from "./EquipmentTimeline";
import type { PlayerEquipmentSetup } from "~/lib/database.server";

interface PlayerTabsProps {
  player: {
    id: string;
    slug: string;
    name: string;
  };
  equipmentSetups: (PlayerEquipmentSetup & {
    blade?: { name: string; slug: string };
    forehand_rubber?: { name: string; slug: string };
    backhand_rubber?: { name: string; slug: string };
  })[];
  showEditButtons?: boolean;
}

type TabType = "timeline" | "videos" | "stats";

function VideosSection() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
            Training Videos
          </h3>
          <p className="text-gray-600">
            Professional training footage and technique analysis
          </p>
        </div>
        <div className="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
            Match Highlights
          </h3>
          <p className="text-gray-600">
            Tournament matches and competitive play
          </p>
        </div>
      </div>
    </div>
  );
}

function CareerStats() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-3">Rankings</h3>
          <p className="text-gray-600">Historical world ranking progression</p>
        </div>
        <div className="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
            Achievements
          </h3>
          <p className="text-gray-600">Major tournament wins and medals</p>
        </div>
      </div>
    </div>
  );
}

export function PlayerTabs({
  player,
  equipmentSetups,
  showEditButtons = false,
}: PlayerTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("timeline");

  const tabs = [
    { id: "timeline" as const, label: "Equipment Timeline" },
    { id: "videos" as const, label: "Videos" },
    { id: "stats" as const, label: "Career Stats" },
  ];

  return (
    <>
      <section className="tabs bg-white border-b border-gray-200">
        <div className="tab-nav flex max-w-7xl mx-auto px-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`px-6 py-4 font-medium border-b-2 hover:text-gray-900 hover:border-gray-300 focus:outline-none ${
                activeTab === tab.id
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-700"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tab-content py-8">
        {activeTab === "timeline" && (
          <EquipmentTimeline
            equipmentSetups={equipmentSetups}
            playerId={player.slug}
            playerName={player.name}
            showAddButton={showEditButtons}
          />
        )}
        {activeTab === "videos" && <VideosSection />}
        {activeTab === "stats" && <CareerStats />}
      </section>
    </>
  );
}

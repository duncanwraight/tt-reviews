import { useState } from "react";
import { EquipmentTimeline } from "./EquipmentTimeline";
import { YouTubeLite } from "~/components/videos/YouTubeLite";
import type { PlayerEquipmentSetup } from "~/lib/database.server";

interface PlayerFootage {
  id: string;
  player_id: string;
  url: string;
  title: string;
  platform: 'youtube' | 'other';
  active: boolean;
  created_at: string;
  updated_at: string;
}

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
  footage: PlayerFootage[];
  showEditButtons?: boolean;
}

type TabType = "timeline" | "videos";

function VideosSection({ footage, playerName }: { footage: PlayerFootage[]; playerName: string }) {
  if (footage.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Videos Available
          </h3>
          <p className="text-gray-600 mb-6">
            {playerName}'s videos haven't been submitted yet.
          </p>
          <a
            href={`/submissions/video/submit?player=${encodeURIComponent(playerName)}`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            Submit Video Information
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Add Video Button */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">
          Videos ({footage.length})
        </h3>
        <a
          href={`/submissions/video/submit?player=${encodeURIComponent(playerName)}`}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-purple-600 bg-purple-100 hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Video
        </a>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {footage.map((video) => (
          <YouTubeLite
            key={video.id}
            url={video.url}
            title={video.title}
          />
        ))}
      </div>
    </div>
  );
}


export function PlayerTabs({
  player,
  equipmentSetups,
  footage,
  showEditButtons = false,
}: PlayerTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("timeline");

  const tabs = [
    { id: "timeline" as const, label: "Equipment Timeline" },
    { id: "videos" as const, label: "Videos" },
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
            playerId={player.id}
            playerName={player.name}
            showAddButton={showEditButtons}
          />
        )}
        {activeTab === "videos" && <VideosSection footage={footage} playerName={player.name} />}
      </section>
    </>
  );
}

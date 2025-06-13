import type { Player } from "~/lib/database.server";

interface PlayerHeaderProps {
  player: Player;
  showEditButton?: boolean;
}

// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    CHN: "🇨🇳",
    JPN: "🇯🇵",
    GER: "🇩🇪",
    KOR: "🇰🇷",
    SWE: "🇸🇪",
    FRA: "🇫🇷",
    HKG: "🇭🇰",
    TPE: "🇹🇼",
    SGP: "🇸🇬",
    USA: "🇺🇸",
    BRA: "🇧🇷",
    EGY: "🇪🇬",
    NIG: "🇳🇬",
    IND: "🇮🇳",
    AUS: "🇦🇺",
    POL: "🇵🇱",
    ROU: "🇷🇴",
    AUT: "🇦🇹",
    DEN: "🇩🇰",
    CRO: "🇭🇷",
    SVK: "🇸🇰",
  };
  return flags[countryCode] || "🏳️";
}

function getPlayingStyleLabel(style: string | undefined): string {
  if (!style || style === "unknown") return "";
  return style.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function PlayerHeader({
  player,
  showEditButton = false,
}: PlayerHeaderProps) {
  return (
    <section className="player-header bg-white border-b border-gray-200 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="player-info grid grid-cols-1 lg:grid-cols-6 gap-8 items-center">
          <div className="player-photo lg:col-span-1">
            <div className="w-36 h-36 bg-gray-200 rounded-lg flex items-center justify-center text-6xl text-gray-400 mx-auto lg:mx-0">
              📷
            </div>
          </div>

          <div className="player-details lg:col-span-4 text-center lg:text-left">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {player.name}
            </h1>
            <div className="player-meta flex flex-wrap justify-center lg:justify-start gap-6 mb-4 text-sm">
              {(player.represents || player.birth_country) && (
                <span>
                  <span className="font-medium text-gray-700">Represents:</span>{" "}
                  {getCountryFlag(player.represents || player.birth_country)}{" "}
                  {player.represents || player.birth_country}
                </span>
              )}
              {player.highest_rating && (
                <span>
                  <span className="font-medium text-gray-700">
                    Highest Rating:
                  </span>{" "}
                  {player.highest_rating}
                </span>
              )}
              {player.active_years && (
                <span>
                  <span className="font-medium text-gray-700">Active:</span>{" "}
                  {player.active_years}
                </span>
              )}
              {player.playing_style && player.playing_style !== "unknown" && (
                <span>
                  <span className="font-medium text-gray-700">Style:</span>{" "}
                  {getPlayingStyleLabel(player.playing_style)}
                </span>
              )}
            </div>
          </div>

          <div className="player-stats lg:col-span-1 text-center lg:text-right">
            {showEditButton && (
              <div className="mb-4">
                <a
                  href={`/players/${player.slug}/edit`}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Edit Player
                </a>
              </div>
            )}
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium text-gray-900">
                Notable Achievements
              </span>
            </p>
            <p className="text-sm text-gray-600">
              World Championship semifinalist, Olympic bronze medalist
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

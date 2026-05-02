import {
  ArrowRight,
  CheckCircle2,
  Globe,
  History,
  XCircle,
} from "lucide-react";
import { Link } from "react-router";
import { DiscordIcon } from "~/components/ui/DiscordIcon";
import { formatDateTime } from "~/lib/date";
import type {
  ActivitySubmissionType,
  AdminActivityEntry,
} from "~/lib/admin/activity.server";

interface AdminActivityWidgetProps {
  entries: AdminActivityEntry[];
}

const ENTITY_LABEL: Record<ActivitySubmissionType, string> = {
  equipment: "Equipment submission",
  player: "Player submission",
  player_edit: "Player edit",
  review: "Equipment review",
  video: "Video submission",
  player_equipment_setup: "Equipment setup",
  equipment_edit: "Equipment edit",
};

// Per-type text colour so the moderator can scan the feed and tell
// at a glance what kind of submission each row is about. Hues chosen
// to be distinct at small sizes; the {600} weight keeps contrast on
// the white card background readable.
const ENTITY_COLOR: Record<ActivitySubmissionType, string> = {
  equipment: "text-orange-700",
  equipment_edit: "text-amber-700",
  player: "text-indigo-700",
  player_edit: "text-blue-700",
  review: "text-purple-700",
  video: "text-rose-700",
  player_equipment_setup: "text-teal-700",
};

export function AdminActivityWidget({ entries }: AdminActivityWidgetProps) {
  return (
    <div className="bg-white rounded-lg shadow px-6 pt-6 pb-3">
      <div className="flex items-center gap-2 mb-4">
        <History className="size-5 text-gray-600" aria-hidden />
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-600">
          No moderation actions recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 [&>li:last-child]:pb-0">
          {entries.map(entry => (
            <li
              key={entry.id}
              className="py-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-center"
            >
              {entry.action === "approved" ? (
                <CheckCircle2
                  className="size-5 text-green-600"
                  aria-label="approved"
                />
              ) : (
                <XCircle
                  className="size-5 text-red-600"
                  aria-label="rejected"
                />
              )}
              <p className="text-sm text-gray-900 min-w-0 flex items-center gap-1.5 flex-wrap">
                <EntityLink
                  type={entry.submissionType}
                  viewUrl={entry.viewUrl}
                />
                <ArrowRight
                  className="size-3.5 text-gray-400 shrink-0"
                  aria-hidden
                />
                <span className="text-gray-700">{entry.actor}</span>
              </p>
              <SourceIcon source={entry.source} />
              <p className="text-xs text-gray-500">
                {formatDateTime(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface EntityLinkProps {
  type: ActivitySubmissionType;
  viewUrl: string | null;
}

function EntityLink({ type, viewUrl }: EntityLinkProps) {
  const label = ENTITY_LABEL[type];
  const colour = ENTITY_COLOR[type];
  if (!viewUrl) {
    // Rejected new-equipment / new-player rows: nothing to link to.
    return <span className={`font-semibold ${colour}`}>{label}</span>;
  }
  return (
    <Link to={viewUrl} className={`font-semibold underline ${colour}`}>
      {label}
    </Link>
  );
}

interface SourceIconProps {
  source: AdminActivityEntry["source"];
}

function SourceIcon({ source }: SourceIconProps) {
  if (source === "discord") {
    return (
      <DiscordIcon className="size-5 text-indigo-500" aria-label="discord" />
    );
  }
  // admin_ui + unknown → web globe. Unknown is rare (legacy rows
  // pre-dating the source column); falling back to the admin-UI icon
  // is closer to reality than rendering nothing.
  return <Globe className="size-5 text-gray-500" aria-label="admin ui" />;
}

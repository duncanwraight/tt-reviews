import { CheckCircle2, History, XCircle } from "lucide-react";
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

const SOURCE_LABEL: Record<AdminActivityEntry["source"], string | null> = {
  admin_ui: "Admin UI",
  discord: "Discord",
  unknown: null,
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
          {entries.map(entry => {
            const sourceLabel = SOURCE_LABEL[entry.source];
            return (
              <li key={entry.id} className="py-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
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
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    <span className={ENTITY_COLOR[entry.submissionType]}>
                      {ENTITY_LABEL[entry.submissionType]}
                    </span>{" "}
                    {entry.action}
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    by{" "}
                    <span className="font-semibold text-gray-900">
                      {entry.actor}
                    </span>
                    {sourceLabel && ` (${sourceLabel})`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

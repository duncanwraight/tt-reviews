import { CheckCircle2, History, XCircle } from "lucide-react";
import { formatDate } from "~/lib/date";
import type {
  ActivitySubmissionType,
  AdminActivityEntry,
} from "~/lib/admin/activity.server";

interface AdminActivityWidgetProps {
  entries: AdminActivityEntry[];
}

const ENTITY_LABEL: Record<ActivitySubmissionType, string> = {
  equipment: "equipment submission",
  player: "player submission",
  player_edit: "player edit",
  review: "equipment review",
  video: "video submission",
  player_equipment_setup: "equipment setup",
};

export function AdminActivityWidget({ entries }: AdminActivityWidgetProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="size-5 text-gray-600" aria-hidden />
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-600">
          No moderation actions recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map(entry => (
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
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{entry.actor}</span>{" "}
                  {entry.action} a {ENTITY_LABEL[entry.submissionType]}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

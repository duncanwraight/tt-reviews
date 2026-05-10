import { Link } from "react-router";
import { Clock, Inbox, Hourglass, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatRelativeTime } from "~/lib/date";
import type { SpecSourcingStatus } from "~/lib/spec-sourcing/status.server";

interface SpecSourcingStatusCardProps {
  status: SpecSourcingStatus;
}

// Admin-dashboard card for the spec-sourcing pipeline (TT-149).
// Mirrors the Content Statistics tile shape (TT-188): icon in a
// coloured rounded background + bold value + small label, with the
// cron's last-activity timestamp pinned to a small footer line.
// Card links to /admin/manufacturer-specs (TT-150) so the
// pending-review count doubles as the call-to-action.
export function SpecSourcingStatusCard({
  status,
}: SpecSourcingStatusCardProps) {
  return (
    <Link
      to="/admin/manufacturer-specs"
      className="block bg-white rounded-lg shadow border border-gray-200 hover:border-purple-300 hover:shadow-md transition p-6"
      data-testid="spec-sourcing-status"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Spec sourcing pipeline
      </h3>
      <div className="space-y-4">
        <Tile
          icon={Clock}
          color="bg-blue-100 text-blue-700"
          label="Pending review"
          value={status.pendingReview}
          testId="spec-sourcing-pending-review"
        />
        <Tile
          icon={Inbox}
          color="bg-amber-100 text-amber-700"
          label="Never sourced"
          value={status.neverSourced}
          testId="spec-sourcing-never-sourced"
        />
        <Tile
          icon={Hourglass}
          color="bg-gray-100 text-gray-500"
          label="In cooldown"
          value={status.inCooldown}
          testId="spec-sourcing-in-cooldown"
        />
        <Tile
          icon={CheckCircle2}
          color="bg-emerald-100 text-emerald-700"
          label="Applied total"
          value={status.appliedTotal}
          testId="spec-sourcing-applied-total"
        />
      </div>
      <p
        className="mt-4 text-xs text-gray-500"
        data-testid="spec-sourcing-last-run"
      >
        {status.lastActivityAt ? (
          <>
            Last run:{" "}
            <span data-testid="spec-sourcing-last-run-relative">
              {formatRelativeTime(status.lastActivityAt)}
            </span>
          </>
        ) : (
          <span data-testid="spec-sourcing-never-run">
            Never run — cron will pick up on its next 6-hour tick.
          </span>
        )}
      </p>
    </Link>
  );
}

interface TileProps {
  icon: LucideIcon;
  color: string;
  label: string;
  value: number;
  testId: string;
}

function Tile({ icon: Icon, color, label, value, testId }: TileProps) {
  return (
    <div className="flex items-center" data-testid={testId}>
      <div className={`${color} rounded-lg p-2 mr-3`}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <div className="text-xl font-semibold tabular-nums text-gray-900">
          {value}
        </div>
        <div className="text-sm text-gray-600">{label}</div>
      </div>
    </div>
  );
}

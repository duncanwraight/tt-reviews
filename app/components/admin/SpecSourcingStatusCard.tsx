import { Link } from "react-router";
import { Clock, Inbox, Hourglass, CheckCircle2 } from "lucide-react";
import { formatRelativeTime } from "~/lib/date";
import type { SpecSourcingStatus } from "~/lib/spec-sourcing/status.server";

interface SpecSourcingStatusCardProps {
  status: SpecSourcingStatus;
}

// Admin-dashboard card for the spec-sourcing pipeline (TT-149).
// Mirrors EquipmentPhotoCoverageCard's shape: title, icon+label+value
// rows, then a small footer line carrying the cron's last-activity
// timestamp. Card links to /admin/spec-proposals (TT-150) so the
// pending-review count doubles as the call-to-action.
export function SpecSourcingStatusCard({
  status,
}: SpecSourcingStatusCardProps) {
  return (
    <Link
      to="/admin/spec-proposals"
      className="block bg-white rounded-lg shadow border border-gray-200 hover:border-purple-300 hover:shadow-md transition p-5"
      data-testid="spec-sourcing-status"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Spec sourcing pipeline
        </h3>
      </div>
      <ul className="space-y-2 text-sm">
        <Row
          icon={<Clock className="size-4 text-blue-600" />}
          label="Pending review"
          value={status.pendingReview}
          testId="spec-sourcing-pending-review"
        />
        <Row
          icon={<Inbox className="size-4 text-amber-600" />}
          label="Never sourced"
          value={status.neverSourced}
          testId="spec-sourcing-never-sourced"
        />
        <Row
          icon={<Hourglass className="size-4 text-gray-400" />}
          label="In cooldown"
          value={status.inCooldown}
          testId="spec-sourcing-in-cooldown"
        />
        <Row
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          label="Applied total"
          value={status.appliedTotal}
          testId="spec-sourcing-applied-total"
        />
      </ul>
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

interface RowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  testId: string;
}

function Row({ icon, label, value, testId }: RowProps) {
  return (
    <li className="flex items-center justify-between" data-testid={testId}>
      <span className="flex items-center gap-2 text-gray-700">
        {icon}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-gray-900">{value}</span>
    </li>
  );
}

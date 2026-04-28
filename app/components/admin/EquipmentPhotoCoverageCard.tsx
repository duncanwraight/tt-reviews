import { Link } from "react-router";
import { Inbox, ImageOff, ImageIcon, EyeOff } from "lucide-react";
import type { CoverageCounts } from "~/lib/photo-sourcing/queue-stats.server";

interface EquipmentPhotoCoverageCardProps {
  counts: CoverageCounts;
}

// Compact 5-bucket card for the admin dashboard (TT-98). Mirrors the
// granular shape of /admin/equipment-photos but at-a-glance — no
// recent activity / quota / queue depth here, those live on the
// detail page. Total appears as a denominator on the picked row so
// the catalog-coverage ratio is the headline.
export function EquipmentPhotoCoverageCard({
  counts,
}: EquipmentPhotoCoverageCardProps) {
  const coveragePct =
    counts.total > 0 ? Math.round((counts.picked / counts.total) * 100) : 0;

  return (
    <Link
      to="/admin/equipment-photos"
      className="block bg-white rounded-lg shadow border border-gray-200 hover:border-purple-300 hover:shadow-md transition p-5"
      data-testid="equipment-photo-coverage-card"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Equipment photo coverage
        </h3>
        <span className="text-xs text-gray-500">
          {coveragePct}% of {counts.total}
        </span>
      </div>
      <ul className="space-y-2 text-sm">
        <Row
          icon={<ImageIcon className="size-4 text-emerald-600" />}
          label="Picked"
          value={counts.picked}
          testId="coverage-picked"
        />
        <Row
          icon={<Inbox className="size-4 text-blue-600" />}
          label="Unsourced"
          value={counts.unsourced}
          testId="coverage-unsourced"
        />
        <Row
          icon={<ImageOff className="size-4 text-amber-600" />}
          label="Attempted, no image"
          value={counts.attemptedNoImage}
          testId="coverage-attempted-no-image"
        />
        <Row
          icon={<EyeOff className="size-4 text-gray-400" />}
          label="Skipped"
          value={counts.skipped}
          testId="coverage-skipped"
        />
      </ul>
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

import { Link } from "react-router";
import { Inbox, ImageOff, ImageIcon, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CoverageCounts } from "~/lib/photo-sourcing/queue-stats.server";

interface EquipmentPhotoCoverageCardProps {
  counts: CoverageCounts;
}

// Compact 5-bucket card for the admin dashboard (TT-98). Mirrors the
// granular shape of /admin/equipment-photos but at-a-glance — no
// recent activity / quota / queue depth here, those live on the
// detail page. Total appears as a denominator on the headline so the
// catalog-coverage ratio is the headline. Tile shape matches Content
// Statistics on the same row (TT-188) for visual consistency.
export function EquipmentPhotoCoverageCard({
  counts,
}: EquipmentPhotoCoverageCardProps) {
  const coveragePct =
    counts.total > 0 ? Math.round((counts.picked / counts.total) * 100) : 0;

  return (
    <Link
      to="/admin/equipment-photos"
      className="block bg-white rounded-lg shadow border border-gray-200 hover:border-purple-300 hover:shadow-md transition p-6"
      data-testid="equipment-photo-coverage-card"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Equipment photo coverage
      </h3>
      <div className="space-y-4">
        <Tile
          icon={ImageIcon}
          color="bg-emerald-100 text-emerald-700"
          label="Picked"
          value={counts.picked}
          testId="coverage-picked"
        />
        <Tile
          icon={Inbox}
          color="bg-blue-100 text-blue-700"
          label="Unsourced"
          value={counts.unsourced}
          testId="coverage-unsourced"
        />
        <Tile
          icon={ImageOff}
          color="bg-amber-100 text-amber-700"
          label="Attempted, no image"
          value={counts.attemptedNoImage}
          testId="coverage-attempted-no-image"
        />
        <Tile
          icon={EyeOff}
          color="bg-gray-100 text-gray-500"
          label="Skipped"
          value={counts.skipped}
          testId="coverage-skipped"
        />
      </div>
      <p
        className="mt-4 text-xs text-gray-500"
        data-testid="coverage-headline-ratio"
      >
        {coveragePct}% of {counts.total}
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

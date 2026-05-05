import { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  Inbox,
  XCircle,
  ImageOff,
  ImageIcon,
  EyeOff,
} from "lucide-react";
import type {
  FullPhotoStats,
  RecentAttempt,
  RecentAttemptOutcome,
} from "~/lib/photo-sourcing/queue-stats.server";

interface EquipmentPhotoStatsBannerProps {
  stats: FullPhotoStats;
}

// Full stats banner above the /admin/equipment-photos review queue
// (TT-98). Three rows of information:
//   1. Coverage counts (picked / unsourced / attempted-no-image /
//      skipped / total).
//   2. Throughput + provider quota (last-hour processed + Brave today
//      / month).
//   3. Collapsible recent-activity log (last 20 attempts).
export function EquipmentPhotoStatsBanner({
  stats,
}: EquipmentPhotoStatsBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const { counts, processedLastHour, providerStats, recentAttempts } = stats;
  const coveragePct =
    counts.total > 0 ? Math.round((counts.picked / counts.total) * 100) : 0;

  return (
    <section
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 space-y-3"
      data-testid="photo-stats-banner"
      aria-label="Equipment photo stats"
    >
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <CountStat
          icon={<ImageIcon className="size-4 text-emerald-600" />}
          label="Picked"
          value={counts.picked}
          testId="banner-picked"
        />
        <CountStat
          icon={<Inbox className="size-4 text-blue-600" />}
          label="Unsourced"
          value={counts.unsourced}
          testId="banner-unsourced"
        />
        <CountStat
          icon={<ImageOff className="size-4 text-amber-600" />}
          label="Attempted, no image"
          value={counts.attemptedNoImage}
          testId="banner-attempted-no-image"
        />
        <CountStat
          icon={<EyeOff className="size-4 text-gray-400" />}
          label="Skipped"
          value={counts.skipped}
          testId="banner-skipped"
        />
        <span className="text-xs text-gray-500 ml-auto">
          {coveragePct}% of {counts.total}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm border-t border-gray-100 pt-3">
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <Activity className="size-4 text-gray-500" aria-hidden="true" />
          <span className="text-gray-600">Last hour:</span>
          <span
            className="font-semibold tabular-nums"
            data-testid="banner-last-hour"
          >
            {processedLastHour}
          </span>
        </span>
        {providerStats.map(p => (
          <ProviderStat key={p.name} stats={p} />
        ))}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
          aria-expanded={expanded}
          aria-controls="photo-recent-activity"
          data-testid="banner-recent-toggle"
        >
          {expanded ? (
            <ChevronDown className="size-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3" aria-hidden="true" />
          )}
          Recent activity ({recentAttempts.length})
        </button>
      </div>

      {expanded && (
        <div
          id="photo-recent-activity"
          className="border-t border-gray-100 pt-3"
        >
          {recentAttempts.length === 0 ? (
            <p className="text-xs text-gray-500">No recent activity.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {recentAttempts.map(a => (
                <RecentAttemptRow key={a.slug} attempt={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

interface CountStatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  testId: string;
}

function CountStat({ icon, label, value, testId }: CountStatProps) {
  return (
    <div className="inline-flex items-center gap-1.5" data-testid={testId}>
      {icon}
      <span className="text-gray-600">{label}:</span>
      <span className="font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

interface ProviderStatProps {
  stats: {
    name: string;
    dailyUsed: number;
    dailyCap: number;
    monthlyUsed: number;
    monthlyCap: number;
  };
}

function ProviderStat({ stats }: ProviderStatProps) {
  const dailyOver = stats.dailyUsed >= stats.dailyCap;
  const monthlyOver = stats.monthlyUsed >= stats.monthlyCap;
  const flagged = dailyOver || monthlyOver;
  return (
    <div
      className="inline-flex items-center gap-1.5"
      data-testid={`banner-provider-${stats.name}`}
      title={`${stats.name} budget; resets daily / monthly`}
    >
      <Clock
        className={`size-4 ${flagged ? "text-amber-600" : "text-gray-500"}`}
        aria-hidden="true"
      />
      <span className="text-gray-600 capitalize">{stats.name}:</span>
      <span
        className={`font-semibold tabular-nums ${dailyOver ? "text-amber-700" : "text-gray-900"}`}
      >
        {stats.dailyUsed}/{stats.dailyCap}
      </span>
      <span className="text-gray-500">today,</span>
      <span
        className={`font-semibold tabular-nums ${monthlyOver ? "text-amber-700" : "text-gray-900"}`}
      >
        {stats.monthlyUsed}/{stats.monthlyCap}
      </span>
      <span className="text-gray-500">this month</span>
    </div>
  );
}

interface RecentAttemptRowProps {
  attempt: RecentAttempt;
}

function RecentAttemptRow({ attempt }: RecentAttemptRowProps) {
  return (
    <li className="flex items-center gap-2">
      <OutcomeIcon outcome={attempt.outcome} />
      <span className="font-mono text-gray-700">{attempt.slug}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-500">{attempt.outcome}</span>
      <span className="text-gray-400 ml-auto">
        {new Date(attempt.attemptedAt).toLocaleTimeString()}
      </span>
    </li>
  );
}

function OutcomeIcon({ outcome }: { outcome: RecentAttemptOutcome }) {
  if (outcome === "picked") {
    return (
      <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="picked" />
    );
  }
  if (outcome === "in-review") {
    return <Inbox className="size-3.5 text-amber-500" aria-label="in review" />;
  }
  if (outcome === "skipped") {
    return <XCircle className="size-3.5 text-gray-400" aria-label="skipped" />;
  }
  return (
    <Inbox className="size-3.5 text-blue-500" aria-label="awaiting review" />
  );
}

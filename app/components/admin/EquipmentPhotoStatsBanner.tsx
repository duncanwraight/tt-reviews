import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Clock,
  CheckCircle2,
  Inbox,
  ImageOff,
  ImageIcon,
  EyeOff,
  RefreshCcw,
  RotateCw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  FullPhotoStats,
  PhotoEvent,
} from "~/lib/photo-sourcing/queue-stats.server";
import type { PhotoEventKind } from "~/lib/photo-sourcing/events.server";

interface EquipmentPhotoStatsBannerProps {
  stats: FullPhotoStats;
}

const EVENTS_VISIBLE_INITIAL = 20;

// Full stats banner above the /admin/equipment-photos review queue
// (TT-98). Three rows of information:
//   1. Coverage counts (picked / unsourced / attempted-no-image /
//      skipped / total).
//   2. Throughput + provider quota (last-hour processed + Brave today
//      / month).
//   3. Collapsible recent-event log (TT-174). Default top
//      EVENTS_VISIBLE_INITIAL (20); "show more" expands to the full
//      RECENT_EVENTS_LIMIT (50) loaded by the loader.
export function EquipmentPhotoStatsBanner({
  stats,
}: EquipmentPhotoStatsBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { counts, processedLastHour, providerStats, recentEvents } = stats;
  const coveragePct =
    counts.total > 0 ? Math.round((counts.picked / counts.total) * 100) : 0;
  const visibleEvents = showAll
    ? recentEvents
    : recentEvents.slice(0, EVENTS_VISIBLE_INITIAL);

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
          Recent activity ({recentEvents.length})
        </button>
      </div>

      {expanded && (
        <div
          id="photo-recent-activity"
          className="border-t border-gray-100 pt-3"
        >
          {recentEvents.length === 0 ? (
            <p className="text-xs text-gray-500">No recent activity.</p>
          ) : (
            <>
              <ul className="space-y-1.5 text-xs" data-testid="recent-events">
                {visibleEvents.map(event => (
                  <PhotoEventRow key={event.id} event={event} />
                ))}
              </ul>
              {!showAll && recentEvents.length > EVENTS_VISIBLE_INITIAL && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-2 text-xs text-gray-600 hover:text-gray-900"
                  data-testid="banner-show-all-events"
                >
                  Show {recentEvents.length - EVENTS_VISIBLE_INITIAL} more
                </button>
              )}
            </>
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

interface PhotoEventRowProps {
  event: PhotoEvent;
}

function PhotoEventRow({ event }: PhotoEventRowProps) {
  const presentation = EVENT_PRESENTATION[event.eventKind];
  const summary = formatEventSummary(event);
  return (
    <li
      className="flex items-center gap-2"
      data-testid={`event-row-${event.eventKind}`}
      data-event-slug={event.slug}
    >
      <span className={presentation.iconClass} aria-hidden="true">
        {presentation.icon}
      </span>
      <span className="text-gray-700">{presentation.label}</span>
      <span className="text-gray-400">·</span>
      <span className="font-mono text-gray-700">{event.slug}</span>
      {summary && (
        <>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">{summary}</span>
        </>
      )}
      <span className="text-gray-400 ml-auto">
        {new Date(event.createdAt).toLocaleTimeString()}
      </span>
    </li>
  );
}

interface EventPresentation {
  label: string;
  icon: React.ReactNode;
  iconClass: string;
}

const EVENT_PRESENTATION: Record<PhotoEventKind, EventPresentation> = {
  sourcing_attempted: {
    label: "Sourced",
    icon: <Search className="size-3.5" />,
    iconClass: "text-blue-500",
  },
  candidates_found: {
    label: "Candidates found",
    icon: <Inbox className="size-3.5" />,
    iconClass: "text-blue-600",
  },
  no_candidates: {
    label: "No candidates",
    icon: <ImageOff className="size-3.5" />,
    iconClass: "text-amber-500",
  },
  provider_transient: {
    label: "Provider transient",
    icon: <AlertTriangle className="size-3.5" />,
    iconClass: "text-amber-600",
  },
  auto_picked: {
    label: "Auto-picked",
    icon: <Sparkles className="size-3.5" />,
    iconClass: "text-emerald-600",
  },
  routed_to_review: {
    label: "Routed to review",
    icon: <Inbox className="size-3.5" />,
    iconClass: "text-amber-500",
  },
  requeued: {
    label: "Re-queued",
    icon: <RotateCw className="size-3.5" />,
    iconClass: "text-blue-500",
  },
  picked: {
    label: "Picked",
    icon: <CheckCircle2 className="size-3.5" />,
    iconClass: "text-emerald-600",
  },
  skipped: {
    label: "Skipped",
    icon: <CircleSlash className="size-3.5" />,
    iconClass: "text-gray-500",
  },
  candidate_rejected: {
    label: "Candidate rejected",
    icon: <XCircle className="size-3.5" />,
    iconClass: "text-rose-500",
  },
  resourced: {
    label: "Re-sourced",
    icon: <RefreshCcw className="size-3.5" />,
    iconClass: "text-blue-500",
  },
};

function formatEventSummary(event: PhotoEvent): string {
  const m = event.metadata;
  switch (event.eventKind) {
    case "sourcing_attempted": {
      const trigger = stringField(m, "triggered_by");
      return trigger ? `triggered by ${trigger}` : "";
    }
    case "candidates_found": {
      const inserted = numberField(m, "inserted_count");
      return inserted !== null ? `${inserted} new` : "";
    }
    case "no_candidates":
      return "providers returned no images";
    case "provider_transient": {
      const provider = stringField(m, "provider");
      const reason = stringField(m, "reason");
      const attempts = numberField(m, "attempts");
      const parts: string[] = [];
      if (provider) parts.push(provider);
      if (reason) parts.push(reason.replace(/_/g, " "));
      if (attempts !== null && attempts > 0) parts.push(`attempt ${attempts}`);
      return parts.join(", ");
    }
    case "auto_picked": {
      const tier = numberField(m, "tier");
      return tier !== null ? `tier ${tier}` : "";
    }
    case "routed_to_review": {
      const count = numberField(m, "candidate_count");
      return count !== null
        ? `${count} candidate${count === 1 ? "" : "s"} pending`
        : "";
    }
    case "requeued": {
      const previous = stringField(m, "previous_image_key");
      return previous ? `previous: ${previous}` : "no previous image";
    }
    case "picked": {
      const previous = stringField(m, "previous_image_key");
      return previous ? `replaced ${previous}` : "first picked image";
    }
    case "skipped":
    case "resourced": {
      const cleared = numberField(m, "candidate_count_cleared");
      return cleared !== null ? `${cleared} cleared` : "";
    }
    case "candidate_rejected":
      return "";
    default:
      return "";
  }
}

function stringField(m: Record<string, unknown>, key: string): string | null {
  const v = m[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numberField(m: Record<string, unknown>, key: string): number | null {
  const v = m[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

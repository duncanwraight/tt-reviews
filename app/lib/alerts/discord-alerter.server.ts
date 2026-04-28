/**
 * Discord error alerter — posts to a Discord channel when Logger.error fires.
 *
 * Wired in workers/app.ts via installAlerter(env, ctx). Logger.error then
 * calls alerter.notify() fire-and-forget through ctx.waitUntil so the alert
 * survives the request lifecycle without blocking the response. Dedup is
 * per-isolate (in-memory Map) so an incident cascade doesn't blast the
 * channel — cross-isolate dupes during an active incident are acceptable.
 *
 * Gating: only fires when DISCORD_ALERTS_CHANNEL_ID is set AND
 * DISCORD_BOT_TOKEN is real (not a stub/placeholder). Local dev with the
 * channel unset → no-op. CI with stubbed bot token → POST 401s and is
 * swallowed; the e2e spec verifies via getLastAttempt() instead. See
 * docs/OBSERVABILITY.md for the alerts section.
 */

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const PLACEHOLDER_NEEDLES = ["your_", "placeholder", "stub"];

export interface AlerterEnv {
  DISCORD_ALERTS_CHANNEL_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  ENVIRONMENT?: string;
}

export interface AlertPayload {
  message: string;
  source?: string;
  route?: string;
  requestId?: string;
  error?: { name: string; message: string };
}

export interface AlertAttempt {
  payload: AlertPayload;
  channelId: string;
  embed: DiscordEmbed;
  attemptedAt: string;
  posted: boolean;
  httpStatus?: number;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp: string;
}

export class DiscordAlerter {
  private env: AlerterEnv;
  private dedup = new Map<string, number>();
  private lastAttempt: AlertAttempt | null = null;

  constructor(env: AlerterEnv) {
    this.env = env;
  }

  updateEnv(env: AlerterEnv): void {
    this.env = env;
  }

  /**
   * Fire-and-forget: returns a promise so the caller can pass to
   * ctx.waitUntil. Resolves true when a POST was attempted, false when
   * skipped (config gate, dedup, etc). Never throws.
   */
  async notify(
    payload: AlertPayload,
    now: number = Date.now()
  ): Promise<boolean> {
    const channelId = this.env.DISCORD_ALERTS_CHANNEL_ID;
    if (!channelId || isPlaceholder(channelId)) {
      return false;
    }

    const dedupKey = payload.message;
    const lastFired = this.dedup.get(dedupKey);
    if (lastFired !== undefined && now - lastFired < DEDUP_WINDOW_MS) {
      return false;
    }
    this.dedup.set(dedupKey, now);
    this.evictOldDedup(now);

    const embed = buildEmbed(payload, this.env.ENVIRONMENT ?? "unknown");
    const attempt: AlertAttempt = {
      payload,
      channelId,
      embed,
      attemptedAt: new Date(now).toISOString(),
      posted: false,
    };
    this.lastAttempt = attempt;

    const botToken = this.env.DISCORD_BOT_TOKEN;
    if (!botToken || isPlaceholder(botToken) || botToken.length < 50) {
      // No real bot token (CI stub, local without creds). Attempt is
      // captured for /e2e-last-alert; no network call.
      return true;
    }

    try {
      const response = await globalThis.fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
            "User-Agent": "tt-reviews-alerter/1.0",
          },
          body: JSON.stringify({ embeds: [embed] }),
        }
      );
      attempt.httpStatus = response.status;
      attempt.posted = response.ok;
    } catch {
      // Swallow — alerter must never throw back into the logger path.
    }
    return true;
  }

  /** Test/e2e helper: returns the most recent attempt regardless of post outcome. */
  getLastAttempt(): AlertAttempt | null {
    return this.lastAttempt;
  }

  /** Test helper: clear dedup + last-attempt between cases. */
  reset(): void {
    this.dedup.clear();
    this.lastAttempt = null;
  }

  private evictOldDedup(now: number): void {
    for (const [key, ts] of this.dedup.entries()) {
      if (now - ts >= DEDUP_WINDOW_MS) {
        this.dedup.delete(key);
      }
    }
  }
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_NEEDLES.some(n => lower.includes(n));
}

function buildEmbed(payload: AlertPayload, environment: string): DiscordEmbed {
  const fields: DiscordEmbed["fields"] = [
    { name: "Environment", value: environment, inline: true },
  ];
  if (payload.source) {
    fields.push({ name: "Source", value: payload.source, inline: true });
  }
  if (payload.route) {
    fields.push({
      name: "Route",
      value: truncate(payload.route, 256),
      inline: false,
    });
  }
  if (payload.requestId) {
    fields.push({
      name: "Request",
      value: truncate(payload.requestId, 64),
      inline: true,
    });
  }
  if (payload.error) {
    fields.push({
      name: payload.error.name || "Error",
      value: truncate(payload.error.message || "(no message)", 1000),
      inline: false,
    });
  }

  return {
    title: truncate(`🚨 ${payload.message}`, 256),
    description:
      environment === "production"
        ? "Production error"
        : `Error in ${environment}`,
    color: 0xe74c3c,
    fields,
    timestamp: new Date().toISOString(),
  };
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

let installed: DiscordAlerter | null = null;
let currentCtx: { waitUntil(p: Promise<unknown>): void } | null = null;

/**
 * Called from workers/app.ts at the top of fetch() and scheduled(). Reuses
 * the alerter instance across requests (so dedup state persists per
 * isolate) but refreshes the env reference and per-request waitUntil ctx.
 */
export function installAlerter(
  env: AlerterEnv,
  ctx: { waitUntil(p: Promise<unknown>): void }
): DiscordAlerter {
  if (installed) {
    installed.updateEnv(env);
  } else {
    installed = new DiscordAlerter(env);
  }
  currentCtx = ctx;
  return installed;
}

/** Used by the Logger output path. Returns null in tests where install was never called. */
export function getInstalledAlerter(): DiscordAlerter | null {
  return installed;
}

/** Used by the Logger output path to drain the fetch via ctx.waitUntil. */
export function getCurrentWaitUntil(): ((p: Promise<unknown>) => void) | null {
  return currentCtx ? p => currentCtx?.waitUntil(p) : null;
}

/** Test helper: clear module-level singletons between vitest cases. */
export function _resetAlerterForTests(): void {
  installed = null;
  currentCtx = null;
}

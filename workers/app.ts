import { createRequestHandler } from "react-router";
import { createClient } from "@supabase/supabase-js";
import { getValidatedEnv } from "../app/lib/env.server";
import { Logger, createLogContext } from "../app/lib/logger.server";
import { recomputeSimilarEquipment } from "../app/lib/equipment/recompute-similar.server";
import { installAlerter } from "../app/lib/alerts/discord-alerter.server";
import {
  processOneSourceMessage,
  computeRetryDelaySeconds,
  type PhotoSourceMessage,
} from "../app/lib/photo-sourcing/queue.server";
import { buildProvidersFromEnv } from "../app/lib/photo-sourcing/providers/factory";
import type { SourcingEnv } from "../app/lib/photo-sourcing/source.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    // Env-config gate. Memoized per isolate, so the cost is one walk on
    // cold start. On failure we 503 every request — CI's preview-smoke
    // step catches that before the new version takes traffic, so a
    // misconfigured Worker can't replace a healthy one in prod. See
    // app/lib/env.server.ts for the rule list.
    //
    // `isDev` is read from Vite's build-time flag instead of
    // `env.ENVIRONMENT` because wrangler.toml's top-level
    // `[vars].ENVIRONMENT="production"` wins over `.dev.vars` under
    // `react-router dev` — the runtime var lies on the e2e CI dev
    // server. The bundled prod Worker has `import.meta.env.DEV=false`.
    const envCheck = getValidatedEnv(
      env as unknown as Record<string, unknown>,
      { isDev: import.meta.env.DEV }
    );
    if (!envCheck.ok) {
      Logger.error(
        "env validation failed",
        createLogContext(
          request.headers.get("X-Request-ID") || "validate-env",
          {
            source: "validate-env",
            problems: envCheck.problems.join("; "),
          }
        )
      );
      return new Response("Service Unavailable: misconfiguration", {
        status: 503,
        headers: {
          "Retry-After": "60",
          "Content-Type": "text/plain",
        },
      });
    }

    // Install the Discord alerter for this request. The alerter is a
    // module singleton with per-isolate dedup state; install just refreshes
    // the env reference and per-request waitUntil ctx so Logger.error can
    // fire alerts without blocking the response. See app/lib/alerts/.
    installAlerter(env as unknown as Record<string, string>, ctx);

    try {
      return await requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (err) {
      // Top-level safety net: anything that escapes the router is logged
      // with a stable `source` tag so `wrangler tail --search source:worker-entry`
      // surfaces it. See docs/OBSERVABILITY.md.
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(
        error.message,
        createLogContext(
          request.headers.get("X-Request-ID") || "worker-entry",
          {
            source: "worker-entry",
            route: request.url,
            method: request.method,
          }
        ),
        error
      );
      throw err;
    }
  },

  // Cron trigger: recompute equipment_similar nightly. Wrangler exposes this
  // locally via `curl 'http://tt-reviews.local:8787/__scheduled?cron=0+3+*+*+*'`
  // while `wrangler dev` runs. Mirrors the fetch path's env gate.
  async scheduled(controller, env, ctx) {
    const envCheck = getValidatedEnv(
      env as unknown as Record<string, unknown>,
      { isDev: import.meta.env.DEV }
    );
    if (!envCheck.ok) {
      Logger.error(
        "scheduled.env-validation-failed",
        createLogContext("scheduled", {
          source: "scheduled",
          cron: controller.cron,
          problems: envCheck.problems.join("; "),
        })
      );
      return;
    }

    // Same alerter install as the fetch path so cron failures alert too.
    installAlerter(env as unknown as Record<string, string>, ctx);

    const ctxLog = createLogContext("scheduled", {
      source: "scheduled",
      cron: controller.cron,
    });

    const job = (async () => {
      try {
        // Both vars are guaranteed by validateEnv above; the cast just bypasses
        // the optional-typing that cf-typegen emits in CI (no .dev.vars there).
        const envVars = env as unknown as Record<string, string>;
        const client = createClient(
          envVars.SUPABASE_URL,
          envVars.SUPABASE_SERVICE_ROLE_KEY
        );
        await recomputeSimilarEquipment(client, ctxLog);
      } catch (err) {
        Logger.error(
          "scheduled.recompute-similar.failed",
          ctxLog,
          err instanceof Error ? err : undefined
        );
      }
    })();

    ctx.waitUntil(job);
  },

  // Photo-source queue consumer (TT-91). Each message represents one
  // equipment row to source. max_batch_size=1 keeps retry semantics
  // simple — ack the whole batch on success, retry the whole batch on
  // transient. The message's `attempts` counter (distinct from CF's
  // max_retries which resets on ack) drives our exponential backoff
  // for out-of-budget retries; CF's max_retries handles thrown errors.
  async queue(batch, env, ctx) {
    const envCheck = getValidatedEnv(
      env as unknown as Record<string, unknown>,
      { isDev: import.meta.env.DEV }
    );
    if (!envCheck.ok) {
      Logger.error(
        "queue.env-validation-failed",
        createLogContext("queue", {
          source: "queue",
          queue: batch.queue,
          problems: envCheck.problems.join("; "),
        })
      );
      // Throw so CF retries the batch when config is fixed.
      throw new Error(`queue: env validation failed`);
    }

    installAlerter(env as unknown as Record<string, string>, ctx);

    const envVars = env as unknown as Record<string, string>;
    const supabase = createClient(
      envVars.SUPABASE_URL,
      envVars.SUPABASE_SERVICE_ROLE_KEY
    );
    const providers = buildProvidersFromEnv(
      env as unknown as Parameters<typeof buildProvidersFromEnv>[0]
    );
    const triggeredBy = "queue-consumer";

    const queueEnv = env as unknown as {
      IMAGE_BUCKET: R2Bucket;
      PHOTO_SOURCE_QUEUE: Queue<PhotoSourceMessage>;
    };

    for (const msg of batch.messages) {
      const ctxLog = createLogContext("queue", {
        queue: batch.queue,
        slug: msg.body.slug,
        attempts: msg.body.attempts ?? 0,
      });

      const outcome = await processOneSourceMessage(
        supabase,
        queueEnv.IMAGE_BUCKET,
        envVars as unknown as SourcingEnv,
        providers,
        triggeredBy,
        msg.body
      );

      if (outcome.status === "transient") {
        const attempts = (msg.body.attempts ?? 0) + 1;
        const delaySeconds = computeRetryDelaySeconds(attempts);
        Logger.info("queue.transient.requeue", ctxLog, {
          reason: outcome.reason,
          delaySeconds,
          attempts,
        });
        // Send a fresh message with bumped attempts; ack the original
        // so CF's max_retries doesn't double-count this against the
        // hard retry budget (those are reserved for thrown errors).
        await queueEnv.PHOTO_SOURCE_QUEUE.send(
          { slug: msg.body.slug, attempts },
          { delaySeconds }
        );
        msg.ack();
        continue;
      }

      if (outcome.status === "error") {
        Logger.error("queue.message.error", ctxLog, new Error(outcome.message));
        // Throw to let CF retry via max_retries; eventually DLQ.
        msg.retry();
        continue;
      }

      Logger.info("queue.message.processed", ctxLog, { outcome });
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, PhotoSourceMessage>;

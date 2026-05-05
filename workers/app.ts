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
import { enqueueSpecSourceBatch } from "../app/lib/spec-sourcing/scheduler.server";
import {
  processOneSpecMessage,
  computeRetryDelaySeconds as computeSpecRetryDelaySeconds,
} from "../app/lib/spec-sourcing/queue.server";
import { buildSpecSourcingFromEnv } from "../app/lib/spec-sourcing/factory";
import type { SpecSourceMessage } from "../app/lib/spec-sourcing/types";

// Union of every queue-message shape the Worker consumes. The
// queue() handler switches on batch.queue to dispatch to the right
// processor.
type WorkerQueueMessage = PhotoSourceMessage | SpecSourceMessage;

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
      const response = await requestHandler(request, {
        cloudflare: { env, ctx },
      });

      // Defense in depth for TT-136: every /admin response carries an
      // X-Robots-Tag noindex header, even on 3xx redirects (which never
      // render the route's <meta robots>). Many crawlers honor the
      // header earlier in the pipeline than the in-body meta tag.
      // Auth/profile/submissions pages rely on their meta() exports;
      // they're not redirected by Cloudflare-edge logic and bots do
      // fetch their HTML.
      const path = new URL(request.url).pathname;
      if (path === "/admin" || path.startsWith("/admin/")) {
        const headers = new Headers(response.headers);
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
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

  // Cron triggers. Wrangler exposes the scheduled handler locally via
  // `curl 'http://tt-reviews.local:8787/__scheduled?cron=<cron+spec>'`
  // when running `wrangler dev`. Each cron string in wrangler.toml's
  // `[triggers].crons` array maps to one branch below.
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

    // Both vars are guaranteed by validateEnv above; the cast just bypasses
    // the optional-typing that cf-typegen emits in CI (no .dev.vars there).
    const envVars = env as unknown as Record<string, string>;

    const job = (async () => {
      try {
        switch (controller.cron) {
          case "0 3 * * *": {
            const client = createClient(
              envVars.SUPABASE_URL,
              envVars.SUPABASE_SERVICE_ROLE_KEY
            );
            await recomputeSimilarEquipment(client, ctxLog);
            break;
          }
          case "0 */6 * * *": {
            const client = createClient(
              envVars.SUPABASE_URL,
              envVars.SUPABASE_SERVICE_ROLE_KEY
            );
            const queue = (
              env as unknown as {
                SPEC_SOURCE_QUEUE: {
                  send: (m: SpecSourceMessage) => Promise<unknown>;
                };
              }
            ).SPEC_SOURCE_QUEUE;
            await enqueueSpecSourceBatch(client, queue, ctxLog);
            break;
          }
          default:
            Logger.warn(
              `scheduled.unknown-cron cron=${controller.cron}`,
              ctxLog
            );
        }
      } catch (err) {
        Logger.error(
          `scheduled.${controller.cron}.failed`,
          ctxLog,
          err instanceof Error ? err : undefined
        );
      }
    })();

    ctx.waitUntil(job);
  },

  // Queue consumer. Two queues land here:
  //   * equipment-photo-source — TT-91 photo sourcing pipeline.
  //   * spec-source-queue      — TT-149 spec sourcing pipeline.
  // Both keep max_batch_size=1 for simple retry semantics; the
  // `attempts` counter on each message body drives our app-level
  // exponential backoff (distinct from Cloudflare's max_retries which
  // resets on every ack and is reserved for thrown errors).
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

    if (
      batch.queue === "equipment-photo-source" ||
      batch.queue === "equipment-photo-source-dev"
    ) {
      const providers = buildProvidersFromEnv(
        env as unknown as Parameters<typeof buildProvidersFromEnv>[0]
      );
      const queueEnv = env as unknown as {
        IMAGE_BUCKET: R2Bucket;
        PHOTO_SOURCE_QUEUE: Queue<PhotoSourceMessage>;
      };

      for (const msg of batch.messages) {
        const body = msg.body as PhotoSourceMessage;
        const ctxLog = createLogContext("queue", {
          queue: batch.queue,
          slug: body.slug,
          attempts: body.attempts ?? 0,
        });

        const outcome = await processOneSourceMessage(
          supabase,
          queueEnv.IMAGE_BUCKET,
          envVars as unknown as SourcingEnv,
          providers,
          body
        );

        if (outcome.status === "transient") {
          const attempts = (body.attempts ?? 0) + 1;
          const delaySeconds = computeRetryDelaySeconds(attempts);
          Logger.info("queue.transient.requeue", ctxLog, {
            reason: outcome.reason,
            delaySeconds,
            attempts,
          });
          await queueEnv.PHOTO_SOURCE_QUEUE.send(
            { slug: body.slug, attempts, triggeredBy: "queue-retry" },
            { delaySeconds }
          );
          msg.ack();
          continue;
        }

        if (outcome.status === "error") {
          Logger.error(
            "queue.message.error",
            ctxLog,
            new Error(outcome.message)
          );
          msg.retry();
          continue;
        }

        Logger.info("queue.message.processed", ctxLog, { outcome });
        msg.ack();
      }
      return;
    }

    if (
      batch.queue === "spec-source-queue" ||
      batch.queue === "spec-source-queue-dev"
    ) {
      const { sources, extractor } = buildSpecSourcingFromEnv(
        env as unknown as Parameters<typeof buildSpecSourcingFromEnv>[0]
      );
      const queueEnv = env as unknown as {
        SPEC_SOURCE_QUEUE: Queue<SpecSourceMessage>;
      };

      for (const msg of batch.messages) {
        const body = msg.body as SpecSourceMessage;
        const ctxLog = createLogContext("queue", {
          queue: batch.queue,
          equipmentId: body.equipmentId,
          slug: body.slug,
          attempts: body.attempts ?? 0,
        });

        const outcome = await processOneSpecMessage(
          supabase,
          sources,
          extractor,
          body,
          ctxLog
        );

        if (outcome.status === "transient") {
          const attempts = (body.attempts ?? 0) + 1;
          const delaySeconds = computeSpecRetryDelaySeconds(attempts);
          Logger.info("queue.spec.transient.requeue", ctxLog, {
            reason: outcome.reason,
            delaySeconds,
            attempts,
          });
          await queueEnv.SPEC_SOURCE_QUEUE.send(
            { ...body, attempts },
            { delaySeconds }
          );
          msg.ack();
          continue;
        }

        if (outcome.status === "error") {
          Logger.error(
            "queue.spec.message.error",
            ctxLog,
            new Error(outcome.message)
          );
          msg.retry();
          continue;
        }

        Logger.info("queue.spec.message.processed", ctxLog, { outcome });
        msg.ack();
      }
      return;
    }

    Logger.warn(
      `queue.unknown-queue queue=${batch.queue}`,
      createLogContext("queue", { queue: batch.queue })
    );
  },
} satisfies ExportedHandler<Env, WorkerQueueMessage>;

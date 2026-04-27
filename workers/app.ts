import { createRequestHandler } from "react-router";
import { getValidatedEnv } from "../app/lib/env.server";
import { Logger, createLogContext } from "../app/lib/logger.server";

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
} satisfies ExportedHandler<Env>;

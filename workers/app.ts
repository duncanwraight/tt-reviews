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
    // Layer 2 of the env-config gate (Layer 1 is `[secrets].required` in
    // wrangler.toml, which blocks deploy when a secret is missing). This
    // catches what Cloudflare can't: missing [vars], short SESSION_SECRET,
    // Discord placeholders left in prod. Memoized per isolate so the cost
    // is one walk on cold start. See app/lib/env.server.ts for the rules.
    const envCheck = getValidatedEnv(env as unknown as Record<string, unknown>);
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

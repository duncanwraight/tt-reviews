import { createRequestHandler } from "react-router";
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

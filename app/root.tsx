import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { data } from "react-router";
import "./app.css";
import { DatabaseService } from "./lib/database.server";
import { createLogContext } from "./lib/logger.server";

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const siteUrl = env.SITE_URL || "https://tabletennis.reviews";

  // Load site content for global access
  const logContext = createLogContext("root_loader");
  const db = new DatabaseService(context, logContext);
  const siteContent = await db.content.getAllContent().catch(() => ({}));

  return data({ siteUrl, siteContent });
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  // siteUrl flows from the root loader (env.SITE_URL, see env.server.ts)
  // so canonical/og:url track preview hosts, not just prod. The
  // hardcoded fallback only fires when the root loader itself errored
  // — in that case validateEnv would already have 503'd the request,
  // so the fallback only matters for genuinely degraded edge cases.
  const rootData = useRouteLoaderData("root") as
    | { siteUrl?: string }
    | undefined;
  const siteUrl = rootData?.siteUrl ?? "https://tabletennis.reviews";

  // Global schemas are inlined here rather than going through schema.ts
  // so the Layout component stays free of shared module state. The
  // `<` → < escape matches toJsonLd's so no JSON-LD path skips the defense.
  const globalSchemas = JSON.stringify(
    [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "TT Reviews",
        url: siteUrl,
        description:
          "Professional table tennis equipment reviews and player database",
        logo: `${siteUrl}/logo.png`,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          url: `${siteUrl}/contact`,
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "TT Reviews",
        url: siteUrl,
        description:
          "Professional table tennis equipment reviews and player database",
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
    null,
    2
  ).replace(/</g, "\\u003c");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* Global structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: globalSchemas }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  } else if (error && error instanceof Error) {
    // In production, sanitize error messages
    details = "An unexpected error occurred. Please try again later.";
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {import.meta.env.DEV && stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

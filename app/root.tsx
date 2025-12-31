import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
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
  // TODO: Get siteUrl from context when available in Layout component
  const siteUrl = "https://tabletennis.reviews"; // Will be made dynamic via context

  // Global schemas are now generated inline to avoid server-only module issues
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
  );

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

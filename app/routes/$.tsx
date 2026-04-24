import type { Route } from "./+types/$";
import { data } from "react-router";
import { Logger, createLogContext } from "~/lib/logger.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Page Not Found | TT Reviews" },
    {
      name: "description",
      content: "The requested page could not be found.",
    },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  // Common bot/scanner paths we can ignore completely
  const botPaths = [
    "/wp-admin/",
    "/wp-login.php",
    "/wp-content/",
    "/xmlrpc.php",
    "/wp-includes/",
    "/.env",
    "/admin/",
    "/administrator/",
    "/phpmyadmin/",
    "/cgi-bin/",
    "/.well-known/",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
  ];

  // Legitimate app paths that should be logged if missing
  const appPaths = [
    "/equipment/",
    "/players/",
    "/reviews/",
    "/admin/",
    "/profile",
    "/login",
    "/signup",
  ];

  const isBotRequest = botPaths.some(path => url.pathname.startsWith(path));
  const isAppPath = appPaths.some(path => url.pathname.startsWith(path));

  if (!isBotRequest) {
    // App paths are logged as warnings (possible broken links); others info-level.
    Logger.warn(
      `404 - ${isAppPath ? "App content" : "Page"} not found`,
      createLogContext("not-found-route", {
        route: url.pathname,
        method: request.method,
      }),
      {
        pathname: url.pathname,
        referrer: request.headers.get("referer") || "none",
        isAppPath,
      }
    );
  }

  // Return 404 response
  throw new Response("Not Found", { status: 404 });
}

export default function NotFound() {
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        404 - Page Not Found
      </h1>
      <p className="text-gray-600 mb-6">
        The requested page could not be found.
      </p>
      <a
        href="/"
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
      >
        Return Home
      </a>
    </main>
  );
}

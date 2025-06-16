import type { Route } from "./+types/$";
import { data } from "react-router";

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
    '/wp-admin/',
    '/wp-login.php',
    '/wp-content/',
    '/xmlrpc.php',
    '/wp-includes/',
    '/.env',
    '/admin/',
    '/administrator/',
    '/phpmyadmin/',
    '/cgi-bin/',
    '/.well-known/',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico',
  ];
  
  // Legitimate app paths that should be logged if missing
  const appPaths = [
    '/equipment/',
    '/players/',
    '/reviews/',
    '/admin/',
    '/profile',
    '/login',
    '/signup',
  ];
  
  const isBotRequest = botPaths.some(path => url.pathname.startsWith(path));
  const isAppPath = appPaths.some(path => url.pathname.startsWith(path));
  
  if (isBotRequest) {
    // Silently handle bot requests
  } else if (isAppPath) {
    // Log app-related 404s as warnings - these might indicate broken links or missing content
    console.warn(`404 - App content not found: ${url.pathname} (Referrer: ${request.headers.get('referer') || 'none'})`);
  } else {
    // Log other 404s as info
    console.info(`404 - Page not found: ${url.pathname}`);
  }
  
  // Return 404 response
  throw new Response("Not Found", { status: 404 });
}

export default function NotFound() {
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">404 - Page Not Found</h1>
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
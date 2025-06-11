import type { Route } from "./+types/test-api";

// API endpoint that returns JSON
export function loader({ request }: Route.LoaderArgs) {
  return {
    message: "Hello from React Router v7 API!",
    timestamp: new Date().toISOString(),
    url: request.url,
  };
}

// This route also supports UI rendering
export default function TestApi({ loaderData }: Route.ComponentProps) {
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>API Test Page</h1>
      <pre>{JSON.stringify(loaderData, null, 2)}</pre>
      <p>
        <strong>Note:</strong> This same route can serve both JSON (for API calls) 
        and HTML (for browser visits) depending on the Accept header.
      </p>
    </div>
  );
}
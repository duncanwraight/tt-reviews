import type { Route } from "./+types/debug-auth";
import { getServerClient } from "~/lib/supabase.server";
import { data } from "react-router";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  
  // Get cookie info
  const cookies = request.headers.get('Cookie') || '';
  
  return data({
    user: userResponse?.data?.user || null,
    error: userResponse?.error?.message || null,
    cookies: cookies.substring(0, 200) + (cookies.length > 200 ? '...' : ''),
    timestamp: new Date().toISOString(),
  }, { headers: sbServerClient.headers });
}

export default function DebugAuth({ loaderData }: Route.ComponentProps) {
  const { user, error, cookies, timestamp } = loaderData;

  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "800px" }}>
      <h1>Authentication Debug</h1>
      <p><strong>Timestamp:</strong> {timestamp}</p>
      
      <div style={{ marginTop: "2rem" }}>
        <h3>User Data:</h3>
        <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px" }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>

      {error && (
        <div style={{ marginTop: "2rem" }}>
          <h3>Error:</h3>
          <pre style={{ background: "#ffebee", padding: "1rem", borderRadius: "4px", color: "#c62828" }}>
            {error}
          </pre>
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <h3>Cookies:</h3>
        <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", wordBreak: "break-all" }}>
          {cookies || '(no cookies)'}
        </pre>
      </div>
      
      <div style={{ marginTop: "2rem" }}>
        <a href="/" style={{ textDecoration: "none", color: "#1976d2" }}>← Back to Home</a>
      </div>
    </div>
  );
}
import type { Route } from "./+types/profile";
import { getServerClient } from "~/lib/supabase.server";
import { redirect, data } from "react-router";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  
  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }
  
  return data({
    user: userResponse.data.user,
  }, { headers: sbServerClient.headers });
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData

  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "600px" }}>
      <h1>Profile</h1>
      
      <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", marginBottom: "2rem" }}>
        <h2>User Information</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>User ID:</strong> {user.id}</p>
        <p><strong>Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <a 
          href="/"
          style={{ 
            padding: "0.75rem 1rem", 
            backgroundColor: "#1976d2", 
            color: "white", 
            textDecoration: "none", 
            borderRadius: "4px" 
          }}
        >
          ← Back to Home
        </a>
        
        <form method="post" action="/logout" style={{ display: "inline" }}>
          <button
            type="submit"
            style={{ 
              padding: "0.75rem 1rem", 
              backgroundColor: "#d32f2f", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </form>
      </div>
    </div>
  )
}
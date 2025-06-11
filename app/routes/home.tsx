import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TT Reviews - Table Tennis Equipment Reviews" },
    { name: "description", content: "The best place for table tennis equipment reviews and player information" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { getOptionalAuth } = await import("~/lib/auth-utils.server");
  const authContext = await getOptionalAuth(request, context);
  
  return { 
    message: context.cloudflare.env.VALUE_FROM_CLOUDFLARE,
    user: authContext?.user || null,
    isAdmin: authContext?.isAdmin || false,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { message, user, isAdmin } = loaderData;

  return (
    <div>
      <nav style={{ padding: "1rem", background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>TT Reviews</h2>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <a href="/test-db" style={{ textDecoration: "none", color: "#1976d2" }}>Test DB</a>
            <a href="/test-api" style={{ textDecoration: "none", color: "#1976d2" }}>Test API</a>
            {user ? (
              <>
                <a href="/profile" style={{ textDecoration: "none", color: "#1976d2" }}>
                  Profile ({user.email})
                </a>
                {isAdmin && (
                  <span style={{ color: "#388e3c", fontWeight: "bold" }}>ADMIN</span>
                )}
                <form method="post" action="/logout" style={{ display: "inline" }}>
                  <button 
                    type="submit"
                    style={{ 
                      background: "none", 
                      border: "none", 
                      color: "#d32f2f", 
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <a href="/login" style={{ textDecoration: "none", color: "#1976d2" }}>Login</a>
            )}
          </div>
        </div>
      </nav>
      <Welcome message={message} />
    </div>
  );
}

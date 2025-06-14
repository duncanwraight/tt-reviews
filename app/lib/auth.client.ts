// Client-side auth utilities
import { createBrowserClient } from "@supabase/ssr";

// Decode JWT to get user role (client-side only)
export function getUserRoleFromSession(env: {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}): string | null {
  if (typeof window === "undefined") return null; // Server-side

  try {
    const supabase = createBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );

    // This is a quick way to get session, but normally you'd use context
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        const payload = JSON.parse(atob(session.access_token.split(".")[1]));
        return payload.user_role || "user";
      }
    });
  } catch (error) {
    // Silently handle error
  }

  return null;
}

// Simple JWT decode for client-side
export function decodeJWT(token: string): any {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

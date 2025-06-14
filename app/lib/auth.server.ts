// Server-side auth utilities
import { checkAndPromoteAdmin, getAdminEmails } from "./auto-promote.server";
import { createSupabaseAdminClient } from "./database.server";
import type { AppLoadContext } from "react-router";

// Decode JWT payload on server-side
export function decodeJWTPayload(token: string): any {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}

// Get user role from session
export async function getUserRoleFromSession(
  supabaseClient: any
): Promise<string | null> {
  try {
    const session = await supabaseClient.auth.getSession();
    if (session.data.session?.access_token) {
      const payload = decodeJWTPayload(session.data.session.access_token);
      return payload?.user_role || "user";
    }
  } catch (error) {
    console.error("Error getting user role:", error);
  }
  return null;
}

// Get authenticated user with role information for consistent navigation
export async function getUserWithRole(supabaseServerClient: any, context?: AppLoadContext) {
  const userResponse = await supabaseServerClient.client.auth.getUser();
  let userWithRole = userResponse?.data?.user || null;

  // Add role information if user is logged in
  if (userWithRole) {
    try {
      // Auto-promote admin emails if context is provided
      if (context) {
        const env = context.cloudflare?.env as Record<string, string>;
        const adminEmails = getAdminEmails(env);
        
        if (adminEmails) {
          const adminClient = createSupabaseAdminClient(context);
          const wasPromoted = await checkAndPromoteAdmin(
            adminClient,
            userWithRole.email,
            userWithRole.id,
            adminEmails
          );
          
          // If user was just promoted, they need to re-login to get updated JWT
          if (wasPromoted) {
            // User was auto-promoted to admin role
          }
        }
      }

      const session = await supabaseServerClient.client.auth.getSession();
      if (session.data.session?.access_token) {
        const payload = decodeJWTPayload(session.data.session.access_token);
        userWithRole = { ...userWithRole, role: payload?.user_role || "user" };
      }
    } catch (error) {
      // If JWT decode fails, just use user without role
      console.error("Error decoding JWT for role:", error);
    }
  }

  return userWithRole;
}

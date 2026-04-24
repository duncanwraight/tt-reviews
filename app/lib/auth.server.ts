// Server-side auth utilities
import { checkAndPromoteAdmin, getAdminEmails } from "./auto-promote.server";
import { createSupabaseAdminClient } from "./database.server";
import { Logger, createLogContext } from "./logger.server";
import type { AppLoadContext } from "react-router";

// Decode JWT payload on server-side
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeJWTPayload(token: string): any {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}

// Get user role from session
export async function getUserRoleFromSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any
): Promise<string | null> {
  try {
    const session = await supabaseClient.auth.getSession();
    if (session.data.session?.access_token) {
      const payload = decodeJWTPayload(session.data.session.access_token);
      return payload?.user_role || "user";
    }
  } catch (error) {
    Logger.error(
      "Error getting user role",
      createLogContext("auth-server"),
      error instanceof Error ? error : undefined
    );
  }
  return null;
}

// Get authenticated user with role information for consistent navigation
export async function getUserWithRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseServerClient: any,
  context?: AppLoadContext
) {
  const userResponse = await supabaseServerClient.client.auth.getUser();
  let userWithRole = userResponse?.data?.user || null;

  // Add role information if user is logged in
  if (userWithRole) {
    try {
      // Auto-promote admin emails if context is provided
      if (context) {
        const env = context.cloudflare?.env as unknown as Record<
          string,
          string
        >;
        const adminEmails = getAdminEmails(env);

        if (adminEmails) {
          const adminClient = createSupabaseAdminClient(context);
          // SECURITY.md Phase 9: only promote users who have verified
          // their email. Supabase returns the user object via
          // `auth.getUser()` even for unverified sign-ups, so without
          // this guard an attacker could claim an admin email and be
          // promoted on first authenticated request without ever
          // reading the confirmation inbox.
          const emailConfirmed = Boolean(
            (userWithRole as { email_confirmed_at?: string | null })
              .email_confirmed_at
          );
          const wasPromoted = await checkAndPromoteAdmin(
            adminClient,
            userWithRole.email,
            userWithRole.id,
            adminEmails,
            emailConfirmed
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
      Logger.error(
        "Error decoding JWT for role",
        createLogContext("auth-server", { userId: userWithRole?.id }),
        error instanceof Error ? error : undefined
      );
    }
  }

  return userWithRole;
}

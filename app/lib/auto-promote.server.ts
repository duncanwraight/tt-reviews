import type { SupabaseClient } from "@supabase/supabase-js";
import { Logger, createLogContext } from "./logger.server";

/**
 * Auto-promote specified email addresses to admin role when the user
 * signs in / refreshes session. SECURITY.md Phase 9 (TT-18) hardens
 * this: without the `emailConfirmed` guard, anyone could sign up with
 * a target address from `AUTO_ADMIN_EMAILS`, never click the confirm
 * link, and still be promoted on their first authenticated request —
 * Supabase's `auth.getUser()` returns the user row even when
 * `email_confirmed_at` is null (the session cookie is enough).
 *
 * Callers must pass `emailConfirmed = !!user.email_confirmed_at`. When
 * false, this function exits early. If Supabase's project is configured
 * to require email confirmation, unverified users are blocked; if
 * confirmation is disabled at the project level, every user is
 * confirmed at creation and this guard is a no-op — that's a
 * configuration problem outside this layer.
 */
export async function checkAndPromoteAdmin(
  adminSupabase: SupabaseClient,
  userEmail: string,
  userId: string,
  adminEmails: string,
  emailConfirmed: boolean
): Promise<boolean> {
  if (!adminEmails || !userEmail || !userId) {
    return false;
  }

  if (!emailConfirmed) {
    // Fail-closed: unverified admin email cannot be auto-promoted.
    return false;
  }

  // Parse admin emails from environment variable
  const adminEmailList = adminEmails
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);

  // Check if current user email is in the admin list
  const isAdminEmail = adminEmailList.includes(userEmail.toLowerCase());

  if (!isAdminEmail) {
    return false;
  }

  try {
    // Check if user already has any role
    const { data: existingRole } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    // If already admin, no need to update
    if (existingRole?.role === "admin") {
      return false;
    }

    let error;
    if (existingRole) {
      // User has a role, update it
      const result = await adminSupabase
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", userId);
      error = result.error;
    } else {
      // User has no role, insert new one
      const result = await adminSupabase.from("user_roles").insert({
        user_id: userId,
        role: "admin",
      });
      error = result.error;
    }

    if (error) {
      Logger.error(
        "Failed to promote user to admin",
        createLogContext("auto-promote", { userId }),
        error instanceof Error ? error : undefined
      );
      return false;
    } else {
      return true; // Signal that promotion occurred
    }
  } catch (error) {
    Logger.error(
      "Error in auto-promote admin",
      createLogContext("auto-promote", { userId }),
      error instanceof Error ? error : undefined
    );
    return false;
  }
}

/**
 * Get admin emails from environment variable with validation
 */
export function getAdminEmails(env: Record<string, string>): string {
  const adminEmails = env.AUTO_ADMIN_EMAILS || "";

  // Validate email format if provided
  if (adminEmails) {
    const emails = adminEmails.split(",").map(e => e.trim());
    const invalidEmails = emails.filter(
      email => (email && !email.includes("@")) || email.length < 5
    );

    if (invalidEmails.length > 0) {
      Logger.warn(
        "Invalid admin emails detected",
        createLogContext("auto-promote"),
        { invalidEmails }
      );
    }
  }

  return adminEmails;
}

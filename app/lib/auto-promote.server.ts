import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-promote specified email addresses to admin role
 * This runs when users sign up or sign in to ensure admin status is applied
 */
export async function checkAndPromoteAdmin(
  adminSupabase: SupabaseClient,
  userEmail: string,
  userId: string,
  adminEmails: string
): Promise<boolean> {
  if (!adminEmails || !userEmail || !userId) {
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
      console.error("Failed to promote user to admin:", error);
      return false;
    } else {
      return true; // Signal that promotion occurred
    }
  } catch (error) {
    console.error("Error in auto-promote admin:", error);
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
      console.warn("Invalid admin emails detected:", invalidEmails);
    }
  }

  return adminEmails;
}

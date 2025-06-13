// Server-side auth utilities

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

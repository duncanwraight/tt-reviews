import { expect, type Page } from "@playwright/test";
import { SUPABASE_URL, adminHeaders } from "./supabase";

export const TEST_PASSWORD = "TestPassword123!";

export function generateTestEmail(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${suffix}@test.tt-reviews.local`;
}

/**
 * Create a confirmed user via the Supabase Admin API. Local Supabase has
 * `enable_confirmations = false`, so the user is immediately usable.
 */
export async function createUser(
  email: string,
  password: string = TEST_PASSWORD
): Promise<{ userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`createUser failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { userId: data.id };
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteUser failed (${res.status}): ${await res.text()}`);
  }
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
  });
  if (!list.ok) return;
  const { users } = (await list.json()) as {
    users: Array<{ id: string; email: string }>;
  };
  const found = users.find(u => u.email === email);
  if (found) await deleteUser(found.id);
}

/**
 * Assign or replace a user's role in public.user_roles. The
 * custom_access_token hook reads this at token issue, so the user must
 * re-login for the new role to appear in JWT claims.
 */
export async function setUserRole(
  userId: string,
  role: "admin" | "moderator" | "user"
): Promise<void> {
  const del = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!del.ok) {
    throw new Error(
      `setUserRole delete failed (${del.status}): ${await del.text()}`
    );
  }
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ user_id: userId, role }),
  });
  if (!ins.ok) {
    throw new Error(
      `setUserRole insert failed (${ins.status}): ${await ins.text()}`
    );
  }
}

/**
 * Log in via the UI. Triggers the client-side `supabase.auth.signInWithPassword`
 * flow which sets the session cookie and then `navigate("/")`.
 */
export async function login(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: /Welcome to TT Reviews/i })
  ).toBeVisible();
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^Sign In$/i }).click();
  await page.waitForURL(url => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: /Logout/i }).first()
  ).toBeVisible();
}

/**
 * Log out via the nav's POST /logout form.
 */
export async function logout(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Logout/i })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: /Login/i }).first()
  ).toBeVisible();
}

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  logout,
  setUserRole,
} from "./utils/auth";

test("auth sanity: create user → login → logout → cleanup", async ({
  page,
}) => {
  const email = generateTestEmail("sanity");
  const { userId } = await createUser(email);

  try {
    await login(page, email);
    await expect(page.getByRole("link", { name: /^Profile$/i })).toBeVisible();
    await logout(page);
  } finally {
    await deleteUser(userId);
  }
});

test("auth sanity: admin role promotes to /admin nav after re-login", async ({
  page,
}) => {
  const email = generateTestEmail("admin");
  const { userId } = await createUser(email);

  try {
    await setUserRole(userId, "admin");
    // The custom_access_token hook only fires at login — new role only
    // becomes visible after signing in, not via an existing session.
    await login(page, email);
    await expect(page.getByRole("link", { name: /^Admin$/i })).toBeVisible();
    await logout(page);
  } finally {
    await deleteUser(userId);
  }
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";

// TT-67: the per-queue stat cards on /admin were replaced with a
// single table. Asserts the table renders every queue and that the
// first column links to each queue's admin page.

const EXPECTED_QUEUES: Array<{ title: string; href: string }> = [
  { title: "Equipment Submissions", href: "/admin/equipment-submissions" },
  { title: "Equipment Edits", href: "/admin/equipment-edits" },
  { title: "Player Submissions", href: "/admin/player-submissions" },
  { title: "Player Edits", href: "/admin/player-edits" },
  { title: "Equipment Setups", href: "/admin/player-equipment-setups" },
  { title: "Equipment Reviews", href: "/admin/equipment-reviews" },
  { title: "Video Submissions", href: "/admin/video-submissions" },
];

test("admin dashboard renders queue stats as a single table", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("dashtbl");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await login(page, adminEmail);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    const table = page.getByTestId("admin-stats-table");
    await expect(table).toBeVisible();

    // Headers
    for (const heading of [
      "Queue",
      "Pending",
      "Approved",
      "Rejected",
      "Total",
    ]) {
      await expect(
        table.getByRole("columnheader", { name: heading })
      ).toBeVisible();
    }

    // One row per queue, with first cell linking to the queue page.
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(EXPECTED_QUEUES.length);

    for (const { title, href } of EXPECTED_QUEUES) {
      const link = table.getByRole("link", { name: title });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  } finally {
    await deleteUser(adminId);
  }
});

// TT-184: user-signup counts surfaced in the Content Statistics card.
// We just spun up an admin user above their setup, so the totals must be
// at least 1; we don't assert exact equality because parallel e2e workers
// may be creating users at the same time.
test("admin dashboard surfaces user signup counts", async ({ page }) => {
  const adminEmail = generateTestEmail("signups");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await login(page, adminEmail);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    const total = page.getByTestId("content-stats-users-total");
    const last7 = page.getByTestId("content-stats-users-7d");
    const last30 = page.getByTestId("content-stats-users-30d");

    await expect(total).toBeVisible();
    await expect(last7).toBeVisible();
    await expect(last30).toBeVisible();

    const parseCount = async (locator: typeof total) => {
      const text = (await locator.textContent())?.trim() ?? "";
      const n = Number(text);
      expect(Number.isFinite(n), `expected numeric count, got "${text}"`).toBe(
        true
      );
      return n;
    };

    const totalCount = await parseCount(total);
    const last7Count = await parseCount(last7);
    const last30Count = await parseCount(last30);

    expect(totalCount).toBeGreaterThanOrEqual(1);
    expect(last7Count).toBeGreaterThanOrEqual(1);
    expect(last30Count).toBeGreaterThanOrEqual(1);
    // 7-day window is a subset of the 30-day window, which is a subset of total.
    expect(last7Count).toBeLessThanOrEqual(last30Count);
    expect(last30Count).toBeLessThanOrEqual(totalCount);
  } finally {
    await deleteUser(adminId);
  }
});

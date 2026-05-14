import { test, expect } from "@playwright/test";

// TT-219: regression coverage for the /players "Highest Rating" sort
// (which is now the page's default order). Before this fix, the
// loader called `.order("highest_rating")` on the formatted display
// string and Postgres lex-sorted "WR99" ahead of "WR1" while putting
// every unrated player on page 1 (NULLs first on DESC). After the
// fix, the loader sorts the typed `peak_world_rank` column ASC NULLS
// LAST so the first card on the page is a WR1 player.
//
// Unit-test coverage in app/lib/database/__tests__/players.test.ts
// pins the `.order()` shape (peak_world_rank, asc, nullsFirst:false);
// this spec proves the integration through the loader + the rendered
// PlayerCard so a schema rename or seed regression surfaces here.

test("players: explicit ?sort=highest_rating puts a WR1 player first", async ({
  page,
}) => {
  await page.goto("/players?sort=highest_rating&order=desc");

  const firstCard = page.locator(".player-card").first();
  await expect(firstCard).toBeVisible();
  // Seed (supabase/seed.sql) has multiple WR1 players (LIN Shidong,
  // WANG Chuqin, SUN Yingsha, Ma Long, etc.) — assert the leader's
  // peak rating starts with "WR1 " rather than naming a specific
  // player so the test survives seed reshuffles.
  await expect(firstCard).toContainText(/Peak Rating:\s*WR1\s/);
});

test("players: default sort (no params) is highest_rating — first card is WR1", async ({
  page,
}) => {
  await page.goto("/players");

  const firstCard = page.locator(".player-card").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText(/Peak Rating:\s*WR1\s/);
});

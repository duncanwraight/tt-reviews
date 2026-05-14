import { test, expect } from "@playwright/test";

// TT-224: regression coverage for the /players pro/amateur section
// split + ?kind filter. The loader now fans out two parallel queries
// (one per kind) when no filter is set; the page renders two distinct
// sections. The single-kind paths (?kind=pro / ?kind=amateur) drill
// into one section with full pagination.
//
// Unit tests in app/lib/database/__tests__/players.test.ts pin the
// per-kind `.eq("player_kind", ...)` filter and the kind-specific
// sort column (peak_world_rank asc for pros vs peak_rating_value
// desc for amateurs). This spec proves the integration through the
// loader + UI so a regression in the wiring surfaces here. Memory
// rule "New server-side data-loading paths need e2e coverage"
// applies — this is a new parallel-fan-out path with kind branching.

test("players /kind=all: both pro and amateur sections render", async ({
  page,
}) => {
  await page.goto("/players");

  const proSection = page.getByTestId("players-pro-section");
  const amateurSection = page.getByTestId("players-amateur-section");

  await expect(proSection).toBeVisible();
  await expect(amateurSection).toBeVisible();

  // The shared section headings only appear under kind=all so the
  // single-kind view doesn't carry the redundant "Professional
  // players" label above the same single grid.
  await expect(page.getByTestId("players-pro-heading")).toBeVisible();
  await expect(page.getByTestId("players-amateur-heading")).toBeVisible();

  // Pro section leads with a WR1 player (seed has multiple — assert
  // the rendered Career-best line rather than a specific name).
  const firstProCard = proSection.locator(".player-card").first();
  await expect(firstProCard).toContainText(/Career-best ranking:\s*World #1\s/);

  // The amateur seed rows carry the typed peak rating + the inline
  // Amateur pill on every web surface.
  const firstAmateurCard = amateurSection.locator(".player-card").first();
  await expect(firstAmateurCard).toContainText(/Peak rating:/);
  await expect(
    firstAmateurCard.getByTestId("amateur-pill").first()
  ).toBeVisible();
});

test("players ?kind=pro: only the pro section renders", async ({ page }) => {
  await page.goto("/players?kind=pro");

  await expect(page.getByTestId("players-pro-section")).toBeVisible();
  await expect(page.getByTestId("players-amateur-section")).toHaveCount(0);

  // Section heading is suppressed in the single-kind view (the page
  // <h1> already says "Professional Players"). Assert it via the
  // heading testid.
  await expect(page.getByTestId("players-pro-heading")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: /Professional Players/ })
  ).toBeVisible();
});

test("players ?kind=amateur: only the amateur section renders", async ({
  page,
}) => {
  await page.goto("/players?kind=amateur");

  await expect(page.getByTestId("players-pro-section")).toHaveCount(0);
  await expect(page.getByTestId("players-amateur-section")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Amateur Players/ })
  ).toBeVisible();

  // Amateur pill renders on every amateur card.
  const cards = page
    .getByTestId("players-amateur-section")
    .locator(".player-card");
  await expect(cards.first()).toBeVisible();
  // Each visible amateur card carries the pill (at minimum one;
  // chain the assertion via .first() so a partial paginated page
  // still passes).
  await expect(cards.first().getByTestId("amateur-pill")).toBeVisible();
});

test("players ?kind=amateur sort label flips to 'Peak rating'", async ({
  page,
}) => {
  // Sort dropdown's career-best entry retitles per the visible
  // section. The data-testid is stable across kinds; the text
  // content varies.
  await page.goto("/players?kind=amateur");
  const sortLink = page.getByTestId("players-sort-peak");
  await expect(sortLink).toContainText(/Peak rating/);

  await page.goto("/players?kind=pro");
  const proSortLink = page.getByTestId("players-sort-peak");
  await expect(proSortLink).toContainText(/Career-best ranking/);
});

import { test, expect, type Locator } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { insertApprovedEquipmentReview } from "./utils/data";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminHeaders,
} from "./utils/supabase";

interface SeedEquipment {
  id: string;
  slug: string;
  name: string;
}

async function fetchEquipment(limit: number): Promise<SeedEquipment[]> {
  // Anon key is enough — equipment is publicly readable. Order by created_at
  // desc so the IDs we pick are stable across runs (matches the same
  // tertiary sort key used by the get_popular_equipment RPC, which keeps
  // intent obvious if a future test ever depends on it).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?select=id,slug,name&limit=${limit}&order=created_at.desc`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );
  if (!res.ok) {
    throw new Error(
      `fetchEquipment failed (${res.status}): ${await res.text()}`
    );
  }
  return res.json() as Promise<SeedEquipment[]>;
}

async function deleteUserReviews(userId: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_reviews?user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deleteUserReviews failed (${res.status}): ${await res.text()}`
    );
  }
}

function featuredSection(page: import("@playwright/test").Page): Locator {
  return page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Featured Equipment" }),
  });
}

function featuredCards(page: import("@playwright/test").Page): Locator {
  // Cards in the section are the unified EquipmentCard PlainCard, rendered as
  // <Link to="/equipment/<slug>">. Exclude the section's "View All Equipment"
  // link (href="/equipment") and any future compare-detail anchors.
  return featuredSection(page).locator(
    'a[href^="/equipment/"]:not([href*="/compare/"]):not([href$="/equipment"])'
  );
}

async function cardSlugs(
  page: import("@playwright/test").Page
): Promise<string[]> {
  const hrefs = await featuredCards(page).evaluateAll(els =>
    els.map(el => (el as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  return hrefs.map(h => h.replace(/^\/equipment\//, ""));
}

test.describe
  .serial("Homepage Featured Equipment — review-density states (TT-46)", () => {
  let userId: string;

  test.beforeAll(async () => {
    const { userId: id } = await createUser(generateTestEmail("featured"));
    userId = id;
  });

  test.afterAll(async () => {
    if (userId) await deleteUser(userId);
  });

  test.beforeEach(async () => {
    // Local DB seed has zero approved reviews, so wiping just this user's
    // reviews is sufficient between scenarios.
    if (userId) await deleteUserReviews(userId);
  });

  test("no reviews: renders 6 top-up cards with no rating row", async ({
    page,
  }) => {
    await page.goto("/");

    const section = featuredSection(page);
    await expect(section).toBeVisible();

    const cards = featuredCards(page);
    await expect(cards).toHaveCount(6);

    // No card should render the rating block (stars + "(N review)" text).
    // The PlainCard CardBody only renders that block when reviewCount > 0.
    await expect(section.locator(".text-yellow-400")).toHaveCount(0);
    await expect(section.getByText(/\(\d+ reviews?\)/)).toHaveCount(0);
  });

  test("a few reviews (< 6): reviewed items appear first, top-up has no rating row", async ({
    page,
  }) => {
    // Distinct ratings → RPC's primary sort (averageRating DESC) is
    // deterministic. Single review each so the sort can't be confused
    // with a reviewCount tiebreak.
    const equipment = await fetchEquipment(3);
    const seed = [
      { equipment: equipment[0], rating: 5 },
      { equipment: equipment[1], rating: 4 },
      { equipment: equipment[2], rating: 3 },
    ];
    for (const s of seed) {
      await insertApprovedEquipmentReview({
        userId,
        equipmentId: s.equipment.id,
        reviewText: `featured-test rating=${s.rating}`,
        overallRating: s.rating,
      });
    }

    await page.goto("/");
    const cards = featuredCards(page);
    await expect(cards).toHaveCount(6);

    const slugs = await cardSlugs(page);
    // Reviewed items in rating-desc order occupy the first three slots.
    expect(slugs.slice(0, 3)).toEqual(seed.map(s => s.equipment.slug));

    // Each reviewed card has stars + "(1 review)".
    for (let i = 0; i < 3; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".text-yellow-400").first()).toBeVisible();
      await expect(card.getByText(/\(1 review\)/)).toBeVisible();
    }

    // Top-up slots (3, 4, 5) carry no rating row — random identity, so we
    // assert on the absence of stars/rating, not on the slugs themselves.
    for (let i = 3; i < 6; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".text-yellow-400")).toHaveCount(0);
      await expect(card.getByText(/\(\d+ reviews?\)/)).toHaveCount(0);
    }
  });

  test("≥ 6 reviewed: top 6 by review count, non-reviewed never featured", async ({
    page,
  }) => {
    // Seven items with the same rating (5) but distinct review counts.
    // RPC orders by averageRating DESC, reviewCount DESC — equal ratings
    // make reviewCount the load-bearing tiebreak, fully deterministic.
    const equipment = await fetchEquipment(7);
    const counts = [7, 6, 5, 4, 3, 2, 1]; // pair with equipment in order
    for (let i = 0; i < equipment.length; i++) {
      for (let n = 0; n < counts[i]; n++) {
        await insertApprovedEquipmentReview({
          userId,
          equipmentId: equipment[i].id,
          reviewText: `featured-test #${n + 1}`,
          overallRating: 5,
        });
      }
    }

    await page.goto("/");
    const cards = featuredCards(page);
    await expect(cards).toHaveCount(6);

    const slugs = await cardSlugs(page);
    // Top six in review-count-desc order. The 1-review item is excluded.
    expect(slugs).toEqual(equipment.slice(0, 6).map(e => e.slug));
    expect(slugs).not.toContain(equipment[6].slug);

    // Every featured card carries stars + "(N reviews)".
    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".text-yellow-400").first()).toBeVisible();
      await expect(card.getByText(/\(\d+ reviews?\)/)).toBeVisible();
    }
  });
});

import { test, expect } from "@playwright/test";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";

// TT-142. The page renders three E-E-A-T signals Google reads as
// first-hand experience markers:
//   - reviewer_context badges on each review card (level / style /
//     testing duration);
//   - "Last updated" with <time datetime> under each detail-page
//     title (equipment + player);
//   - the review's published date wrapped in <time datetime>.
//
// The slug fixture is `butterfly-viscaria` (from supabase/seed.sql).
// The review is seeded directly via PostgREST + service-role
// because the public submission flow doesn't accept a synthetic
// status=approved.

const EQUIPMENT_SLUG = "butterfly-viscaria";
const PLAYER_SLUG = "lin-shidong";

async function findEquipmentIdBySlug(slug: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?select=id&slug=eq.${slug}`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  if (rows.length === 0) throw new Error(`equipment not found: ${slug}`);
  return rows[0].id;
}

async function insertApprovedReview(params: {
  equipmentId: string;
  userId: string;
}): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment_reviews`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      equipment_id: params.equipmentId,
      user_id: params.userId,
      status: "approved",
      overall_rating: 9,
      review_text: "Solid blade, recommended.",
      category_ratings: { speed: 9, control: 8 },
      reviewer_context: {
        playing_level: "Expert",
        style_of_play: "Loop attacker",
        testing_duration: "3 months",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`seed review failed (${res.status}): ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0].id;
}

async function deleteReview(reviewId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/equipment_reviews?id=eq.${reviewId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test.describe("seo: E-E-A-T surface signals", () => {
  test("equipment review card renders playing_level + style + testing badges", async ({
    page,
  }) => {
    const { userId } = await createUser(generateTestEmail("eeat"));
    const equipmentId = await findEquipmentIdBySlug(EQUIPMENT_SLUG);
    let reviewId: string | null = null;
    try {
      reviewId = await insertApprovedReview({ equipmentId, userId });

      await page.goto(`/equipment/${EQUIPMENT_SLUG}`);

      const badges = page.getByTestId("review-eeat-badges").first();
      await expect(badges).toBeVisible();
      await expect(badges).toContainText("Expert");
      await expect(badges).toContainText("Loop attacker");
      await expect(badges).toContainText("3 months");
    } finally {
      if (reviewId) await deleteReview(reviewId);
      await deleteUser(userId);
    }
  });

  test("equipment detail shows 'Last updated' with a parseable <time>", async ({
    page,
  }) => {
    await page.goto(`/equipment/${EQUIPMENT_SLUG}`);
    // The text is "Last updated <Nh ago>" (or "Nd ago"). Asserting on
    // the prefix keeps the test stable regardless of how stale the
    // local seed is.
    await expect(page.getByText(/Last updated\s/).first()).toBeVisible();
    // The relative-time element ships with an ISO datetime so
    // crawlers can parse it independently of the rendered string.
    const time = page.locator("time[datetime]").first();
    await expect(time).toHaveAttribute(
      "datetime",
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });

  test("player detail shows 'Last updated' with a parseable <time>", async ({
    page,
  }) => {
    await page.goto(`/players/${PLAYER_SLUG}`);
    await expect(page.getByText(/Last updated\s/).first()).toBeVisible();
    const time = page.locator("time[datetime]").first();
    await expect(time).toHaveAttribute(
      "datetime",
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });
});

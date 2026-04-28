import { test, expect } from "@playwright/test";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-71: similar-equipment section on /equipment/<slug>. Loader reads from
// the equipment_similar precomputed table (populated in TT-70 by the cron
// job + admin manual trigger) and joins equipment + approved-review stats
// for EquipmentCard.
//
// Strategy: seed equipment_similar via service-role REST (rather than running
// the recompute action) so this spec stays focused on the read/render path —
// the recompute path is already covered by admin-recompute-similar.spec.ts.

const ANCHOR_SLUG = "butterfly-viscaria";
// Three other seeded blades — same category, different manufacturers, plenty
// of structural diversity so the algorithm in real prod would also pick them.
const NEIGHBOUR_SLUGS = [
  "butterfly-timo-boll-alc",
  "yasaka-ma-lin-extra-offensive",
  "butterfly-timo-boll-spirit",
];

interface EquipmentRow {
  id: string;
  slug: string;
}

async function fetchEquipmentBySlugs(slugs: string[]): Promise<EquipmentRow[]> {
  const inList = slugs.map(s => `"${s}"`).join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?select=id,slug&slug=in.(${inList})`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `fetchEquipmentBySlugs failed (${res.status}): ${await res.text()}`
    );
  }
  return (await res.json()) as EquipmentRow[];
}

async function deleteSimilarFor(equipmentId: string): Promise<void> {
  // PostgREST requires a filter on DELETE; equipment_id eq our anchor scopes
  // the cleanup so it doesn't touch unrelated test data.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_similar?equipment_id=eq.${equipmentId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deleteSimilarFor failed (${res.status}): ${await res.text()}`
    );
  }
}

// Serial: both tests share the same anchor row in equipment_similar, so
// running them in parallel produces 23505 unique-key collisions on the
// equipment_similar PK. They're independent in semantics but not in fixtures.
test.describe
  .serial("Equipment detail — similar equipment section (TT-71)", () => {
  test("renders 3-col grid of similar equipment from precomputed table", async ({
    page,
  }) => {
    const rows = await fetchEquipmentBySlugs([ANCHOR_SLUG, ...NEIGHBOUR_SLUGS]);
    const anchor = rows.find(r => r.slug === ANCHOR_SLUG);
    const neighbours = NEIGHBOUR_SLUGS.map(slug => {
      const row = rows.find(r => r.slug === slug);
      if (!row) throw new Error(`seed missing equipment slug: ${slug}`);
      return row;
    });
    if (!anchor) throw new Error(`seed missing anchor slug: ${ANCHOR_SLUG}`);

    await deleteSimilarFor(anchor.id);

    const insertRows = neighbours.map((n, i) => ({
      equipment_id: anchor.id,
      similar_equipment_id: n.id,
      score: 1 - i * 0.1,
      rank: i + 1,
    }));

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/equipment_similar`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(insertRows),
    });
    if (!insertRes.ok) {
      throw new Error(
        `seed equipment_similar failed (${insertRes.status}): ${await insertRes.text()}`
      );
    }

    try {
      await page.goto(`/equipment/${ANCHOR_SLUG}`);

      const section = page.getByTestId("similar-equipment-section");
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("heading", { name: /^Similar Blades$/ })
      ).toBeVisible();

      // EquipmentCard renders an <a href="/equipment/<slug>"> for each item.
      // Scope to the section so we don't pick up any nav/breadcrumb links.
      const cards = section.locator('a[href^="/equipment/"]');
      await expect(cards).toHaveCount(neighbours.length);

      for (const n of neighbours) {
        await expect(
          section.locator(`a[href="/equipment/${n.slug}"]`)
        ).toBeVisible();
      }
    } finally {
      await deleteSimilarFor(anchor.id);
    }
  });

  test("hides section entirely when fewer than 2 similar items exist", async ({
    page,
  }) => {
    const rows = await fetchEquipmentBySlugs([ANCHOR_SLUG, NEIGHBOUR_SLUGS[0]]);
    const anchor = rows.find(r => r.slug === ANCHOR_SLUG);
    const neighbour = rows.find(r => r.slug === NEIGHBOUR_SLUGS[0]);
    if (!anchor || !neighbour) throw new Error("seed missing fixture slugs");

    await deleteSimilarFor(anchor.id);

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/equipment_similar`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify([
        {
          equipment_id: anchor.id,
          similar_equipment_id: neighbour.id,
          score: 0.9,
          rank: 1,
        },
      ]),
    });
    if (!insertRes.ok) {
      throw new Error(
        `seed equipment_similar failed (${insertRes.status}): ${await insertRes.text()}`
      );
    }

    try {
      await page.goto(`/equipment/${ANCHOR_SLUG}`);
      // Page must still render for sanity, but the similar-equipment block
      // should not appear at all (single-card neighbourhood reads as filler).
      await expect(
        page.getByRole("heading", { name: /Manufacturer specifications/ })
      ).toBeVisible();
      await expect(page.getByTestId("similar-equipment-section")).toHaveCount(
        0
      );
    } finally {
      await deleteSimilarFor(anchor.id);
    }
  });
});

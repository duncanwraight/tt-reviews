import { test, expect } from "@playwright/test";

// TT-140. The hero image on detail pages is the LCP element.
// loading=lazy or a missing fetchpriority kills the metric. The
// IntersectionObserver-driven LazyImage default would also delay the
// image past first paint. This pins the priority pathway: rendered
// hero <img> ships eager + fetchpriority=high + explicit dimensions
// + srcset out of the box.
//
// Player detail is the chosen fixture because seed players carry
// image_key/image_etag (so the <img> renders) — equipment seeds do
// not. The component-level contract is the same: equipment heroes go
// through the same LazyImage `priority` path.

const PLAYER_DETAIL = "/players/lin-shidong";

test("seo: player detail hero image is eager + high priority + has dimensions + srcset", async ({
  page,
}) => {
  const response = await page.goto(PLAYER_DETAIL);
  expect(response?.status()).toBe(200);

  // Match by alt text rather than .first() — the Navigation logo
  // beats the hero on document order.
  const hero = page.getByRole("img", { name: /lin shidong/i });
  await expect(hero).toHaveAttribute("loading", "eager");
  await expect(hero).toHaveAttribute("fetchpriority", "high");
  await expect(hero).toHaveAttribute("width", /\d+/);
  await expect(hero).toHaveAttribute("height", /\d+/);
  await expect(hero).toHaveAttribute("srcset", /\d+w/);
});

test("seo: navigation logo has explicit dimensions (CLS guard)", async ({
  page,
}) => {
  await page.goto("/");
  // Logo is an above-the-fold <img> on every page; no LazyImage
  // wrapper. Without intrinsic dimensions it would reflow on load,
  // contributing to CLS even on routes where it isn't the LCP
  // element.
  const logo = page.getByRole("img", { name: /tabletennis\.reviews/i });
  await expect(logo).toHaveAttribute("width", /\d+/);
  await expect(logo).toHaveAttribute("height", /\d+/);
});

import { test, expect } from "@playwright/test";

// TT-136. /admin and /admin/* must respond with X-Robots-Tag noindex
// even when the route's HTML never renders (loader-thrown redirects,
// action routes). The Worker entry sets the header for every response
// whose path starts with /admin — see workers/app.ts.

test("seo: /admin responds with X-Robots-Tag noindex (unauthenticated redirect)", async ({
  request,
}) => {
  // maxRedirects: 0 captures the 302 itself rather than following
  // through to /login. The header must ride on the redirect response,
  // not the destination — that's the entire point of doing it at the
  // worker layer.
  const response = await request.get("/admin", { maxRedirects: 0 });
  // Loader throws redirect on missing user; admin layout returns 302.
  expect(response.status()).toBe(302);
  const robots = response.headers()["x-robots-tag"];
  expect(robots).toBe("noindex, nofollow");
});

test("seo: /login renders meta robots noindex,nofollow", async ({ page }) => {
  await page.goto("/login");
  // The meta tag is rendered into <head> by the route's meta() export.
  // Counter-attack against indexing of crawled-but-disallowed-on-robots
  // login URLs.
  const robots = await page
    .locator('meta[name="robots"]')
    .getAttribute("content");
  expect(robots).toBe("noindex, nofollow");
});

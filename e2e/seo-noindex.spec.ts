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

// TT-215. Slug-route 404s (`throw redirect("/players", { status: 404 })`)
// emit an empty body, so the catch-all $.tsx meta robots tag can't run.
// The Worker entry sets X-Robots-Tag: noindex, follow on every 404
// response so the slug-404 case is still de-indexable.
test("seo: /players/<missing> responds with X-Robots-Tag noindex on 404", async ({
  request,
}) => {
  const response = await request.get("/players/this-slug-does-not-exist", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  const robots = response.headers()["x-robots-tag"];
  expect(robots).toBe("noindex, follow");
});

test("seo: /equipment/<missing> responds with X-Robots-Tag noindex on 404", async ({
  request,
}) => {
  const response = await request.get("/equipment/this-slug-does-not-exist", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  const robots = response.headers()["x-robots-tag"];
  expect(robots).toBe("noindex, follow");
});

test("seo: catch-all 404 also carries X-Robots-Tag noindex", async ({
  request,
}) => {
  // The catch-all $.tsx already sets `<meta name="robots" content="noindex">`
  // in the rendered HTML, but the Worker-layer header is the
  // defense-in-depth that protects the slug-404 case where no body
  // renders. Assert it lands on the catch-all path too.
  const response = await request.get("/totally-made-up-page", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  const robots = response.headers()["x-robots-tag"];
  expect(robots).toBe("noindex, follow");
});

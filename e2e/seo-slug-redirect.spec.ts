import { test, expect } from "@playwright/test";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-141. The slug_redirects table powers 301 forwarding when an
// equipment slug changes. This test seeds a redirect row directly
// against the local Postgres (admin headers), then asserts that
// hitting the old URL produces a 301 to the canonical URL. Cleanup
// at the end so reruns stay deterministic.
//
// The seeded equipment slug "butterfly-viscaria" exists in
// supabase/seed.sql; "old-viscaria" doesn't, so the loader's
// findSlugRedirect path is the only way the redirect resolves.

const OLD_SLUG = "old-viscaria-tt-141";
const CANONICAL_SLUG = "butterfly-viscaria";

async function insertRedirect() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/slug_redirects`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      entity_type: "equipment",
      old_slug: OLD_SLUG,
      new_slug: CANONICAL_SLUG,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seed slug_redirect failed (${res.status}): ${await res.text()}`
    );
  }
}

async function deleteRedirect() {
  await fetch(
    `${SUPABASE_URL}/rest/v1/slug_redirects?entity_type=eq.equipment&old_slug=eq.${OLD_SLUG}`,
    { method: "DELETE", headers: adminHeaders() }
  );
}

// Force serial mode: both tests touch the same row, and Playwright
// runs the file across multiple workers by default. Without this,
// the second worker hits a 409 on insert.
test.describe.configure({ mode: "serial" });

test.describe("seo: slug-rename 301 forwarding", () => {
  test.beforeEach(async () => {
    await deleteRedirect();
    await insertRedirect();
  });

  test.afterEach(async () => {
    await deleteRedirect();
  });

  test("old slug 301-redirects to the canonical equipment URL", async ({
    request,
  }) => {
    // maxRedirects: 0 surfaces the 301 itself rather than following
    // through to the canonical page. Asserting on the 301 status is
    // the only way to prove it: 302 would have very different SEO
    // consequences — Google passes link equity through 301 only.
    const response = await request.get(`/equipment/${OLD_SLUG}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    expect(response.headers()["location"]).toBe(`/equipment/${CANONICAL_SLUG}`);
  });

  test("a slug with no redirect row 404s as before", async ({ request }) => {
    // The loader throws redirect("/equipment", { status: 404 }) on a
    // genuine miss — what we care about is the 404 status; the
    // Location-header behaviour for non-3xx codes is a runtime
    // detail we don't pin in tests.
    const response = await request.get(
      "/equipment/nope-this-does-not-exist-anywhere",
      { maxRedirects: 0 }
    );
    expect(response.status()).toBe(404);
  });
});

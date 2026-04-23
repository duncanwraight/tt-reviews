import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { getFirstEquipment, insertApprovedEquipmentReview } from "./utils/data";

// SECURITY.md Phase 4: pins that a stored review body cannot execute
// script on the public equipment page.
//
// Two attack vectors in one payload:
//  - `</script>` at the top would close the JSON-LD <script> block if
//    the schema serializer forgot to escape `<` → <.
//  - `<img src=x onerror=...>` would run if the HTML sanitizer let
//    `<img>` or `on*=` attributes through.
//
// Behavioural assertions are the ground truth: if either defense
// regresses, `window.__xss` gets set by `onerror` / `onload`, or an
// `alert()` pops a dialog. Text-shape checks are scoped to the rendered
// review card (not the whole page) because React Router's streaming
// loader-data script inlines the raw payload as an escaped JSON string,
// which would false-positive a global page.content() regex.
test("stored XSS payload in an approved review is inert on public page", async ({
  page,
}) => {
  const reviewerEmail = generateTestEmail("xss");
  const { userId } = await createUser(reviewerEmail);

  const equipment = await getFirstEquipment();
  const marker = `XSS marker ${Date.now()}`;
  const payload = `</script><img src=x onerror="window.__xss=1"><svg onload="window.__xss=1"> ${marker}`;

  await insertApprovedEquipmentReview({
    userId,
    equipmentId: equipment.id,
    reviewText: payload,
    overallRating: 7,
  });

  try {
    let dialogFired = false;
    page.on("dialog", d => {
      dialogFired = true;
      void d.dismiss();
    });

    await page.goto(`/equipment/${equipment.slug}`);

    // The review body is the div SafeHtml writes sanitized HTML into
    // (ReviewCard uses className="text-gray-700 leading-relaxed"). Scope
    // the assertion to that node — other DOM nodes on the page may
    // legitimately contain <svg> icons etc.
    const reviewBody = page
      .locator("div.text-gray-700.leading-relaxed")
      .filter({ hasText: marker });
    await expect(reviewBody).toBeVisible();

    const innerHtml = await reviewBody.evaluate(el => el.innerHTML);
    expect(innerHtml).not.toMatch(/<(img|svg|script|iframe)\b/i);
    expect(innerHtml).not.toMatch(/\son\w+\s*=/i);
    expect(innerHtml).not.toMatch(/javascript:/i);

    // Behavioural: no alert/prompt/confirm dialog fired, no sentinel set.
    expect(dialogFired).toBe(false);
    const flag = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__xss
    );
    expect(flag).toBeUndefined();

    // JSON-LD defense: every <script type="application/ld+json"> block
    // on the page must escape `<` so a review body containing
    // `</script>` cannot close it early.
    const ldBlocks = await page
      .locator('script[type="application/ld+json"]')
      .all();
    expect(ldBlocks.length).toBeGreaterThan(0);
    for (const block of ldBlocks) {
      const text = (await block.textContent()) ?? "";
      expect(text).not.toContain("</script");
    }
  } finally {
    await deleteUser(userId);
  }
});

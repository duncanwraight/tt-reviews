import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail, login } from "./utils/auth";

// SECURITY.md Phase 8 (TT-17). The old in-memory rate limiter didn't
// share state across isolates, so a production workload could easily
// outrun the 5/min FORM_SUBMISSION cap. The Cloudflare rate-limit
// binding now fronts the budget; this spec does not test the binding
// directly (it's not available in the Vite dev server used by `npm run
// test:e2e`), but pins that the in-memory fallback — which is what
// tests and the dev server rely on — still reliably blocks a burst.
//
// IMPORTANT: the dev server sees all Playwright requests with
// cf-connecting-ip missing, so the rate-limit bucket keys on "unknown"
// by default. Every other e2e test shares that bucket. We pin an
// isolated `cf-connecting-ip` header here so this spec's burst does not
// drain the bucket for unrelated tests (which caused
// user-submits-review.spec.ts to 429-out during an initial run).

test("rapid POSTs to /submissions/review are blocked by the rate limiter", async ({
  request,
  page,
}) => {
  const email = generateTestEmail("rl");
  const { userId } = await createUser(email);

  try {
    await login(page, email);
    const storage = await page.context().storageState();
    const cookies = storage.cookies.map(c => `${c.name}=${c.value}`).join("; ");
    const isolatedIp = `10.77.${Math.floor(Math.random() * 255)}.${Math.floor(
      Math.random() * 255
    )}`;

    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(
        request.post("/submissions/review/submit", {
          headers: {
            Cookie: cookies,
            "cf-connecting-ip": isolatedIp,
          },
          form: { name: `probe-${i}` },
        })
      );
    }
    const responses = await Promise.all(attempts);

    const statuses = responses.map(r => r.status());
    const blocked = statuses.filter(s => s === 429);
    expect(
      blocked.length,
      `statuses were ${statuses.join(",")}`
    ).toBeGreaterThan(0);
  } finally {
    await deleteUser(userId);
  }
});

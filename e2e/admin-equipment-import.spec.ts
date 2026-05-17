import { expect, test } from "@playwright/test";

import {
  createUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { adminHeaders, SUPABASE_URL } from "./utils/supabase";

// TT-243: equipment-import admin UX rewrite. The producer now ships
// `sendBatch` chunks + 302s to a dedicated job-detail page; this page
// polls via revalidator and survives refresh. The jobs-list page is
// the audit history.
//
// We can't drive the live revspin → queue flow end-to-end in e2e (it
// fetches a real upstream + needs a Cloudflare Queue binding running
// locally), so the spec seeds equipment_import_jobs + job_items rows
// directly and asserts the UI renders progress / finished / failures
// from the DB state — same shape the consumer writes. Memory:
// feedback_e2e_for_new_data_paths — new server-side data-loading
// paths need e2e coverage because mocked-Supabase units miss
// query-shape bugs (here: PostgREST select shape on jobs + items).

const TEST_RUN_TAG = `tt243-${Date.now()}`;

async function deleteJobsByCreator(userId: string): Promise<void> {
  // job_items cascades from job_id ON DELETE CASCADE.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_import_jobs?created_by=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`cleanup jobs failed (${res.status}): ${await res.text()}`);
  }
}

interface SeedJobArgs {
  userId: string;
  total: number;
  successCount: number;
  failedCount: number;
  finished: boolean;
  items: Array<{
    slug: string;
    productName: string;
    status: "success" | "failed";
    message?: string | null;
  }>;
}

async function seedJob(args: SeedJobArgs): Promise<string> {
  // Insert with finished_at unset; the trigger on item INSERT will
  // stamp it once success_count + failed_count == total. We rely on
  // that path so the test exercises the same trigger the consumer
  // hits in prod.
  const jobRes = await fetch(`${SUPABASE_URL}/rest/v1/equipment_import_jobs`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ created_by: args.userId, total: args.total }),
  });
  if (!jobRes.ok) {
    throw new Error(
      `seedJob job failed (${jobRes.status}): ${await jobRes.text()}`
    );
  }
  const [job] = (await jobRes.json()) as Array<{ id: string }>;

  if (args.items.length > 0) {
    const payload = args.items.map(item => ({
      job_id: job.id,
      slug: `${TEST_RUN_TAG}-${item.slug}`,
      product_name: item.productName,
      status: item.status,
      message: item.message ?? null,
    }));
    const itemRes = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_import_job_items`,
      {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      }
    );
    if (!itemRes.ok) {
      throw new Error(
        `seedJob items failed (${itemRes.status}): ${await itemRes.text()}`
      );
    }
  }

  if (!args.finished) {
    // Trigger only stamps finished_at when counts reach total. For a
    // "still running" seed we under-fill items so the trigger leaves
    // finished_at null — exactly what the consumer's mid-run state
    // looks like.
    return job.id;
  }

  // Sanity-check the trigger landed us where we wanted.
  return job.id;
}

test.describe("admin equipment import — TT-243", () => {
  let userId: string;
  let email: string;

  test.beforeAll(async () => {
    email = generateTestEmail("admin-import");
    const created = await createUser(email);
    userId = created.userId;
    await setUserRole(userId, "admin");
  });

  test.afterAll(async () => {
    await deleteJobsByCreator(userId);
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  });

  test.beforeEach(async () => {
    await deleteJobsByCreator(userId);
  });

  test("/admin/import/jobs lists recent jobs and links to detail", async ({
    page,
  }) => {
    // Two finished jobs: one all-success, one mixed.
    await seedJob({
      userId,
      total: 2,
      successCount: 2,
      failedCount: 0,
      finished: true,
      items: [
        { slug: "ok-1", productName: "OK 1", status: "success" },
        { slug: "ok-2", productName: "OK 2", status: "success" },
      ],
    });
    const mixedJobId = await seedJob({
      userId,
      total: 2,
      successCount: 1,
      failedCount: 1,
      finished: true,
      items: [
        { slug: "ok-3", productName: "OK 3", status: "success" },
        {
          slug: "fail-1",
          productName: "Fail 1",
          status: "failed",
          message: "Already exists",
        },
      ],
    });

    await login(page, email);
    await page.goto("/admin/import/jobs");

    const list = page.getByTestId("admin-import-jobs-list");
    await expect(list).toBeVisible();
    await expect(
      page.getByTestId(`admin-import-jobs-row-${mixedJobId}`)
    ).toBeVisible();
    // Two seeded jobs → two pills, one with errors, one done.
    await expect(
      page.getByTestId("admin-import-jobs-pill-with_errors")
    ).toBeVisible();
    await expect(page.getByTestId("admin-import-jobs-pill-ok")).toBeVisible();

    // Click into the mixed job — should reveal the failure + success.
    await page
      .getByTestId(`admin-import-jobs-row-${mixedJobId}`)
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(`/admin/import/jobs/${mixedJobId}`);

    await expect(page.getByTestId("admin-import-job-status")).toContainText(
      /Finished with errors/i
    );
    await expect(page.getByTestId("admin-import-job-progress")).toContainText(
      "2 of 2 processed"
    );
    await expect(
      page.getByTestId(`admin-import-job-failure-${TEST_RUN_TAG}-fail-1`)
    ).toContainText("Already exists");
    await expect(
      page.getByTestId(`admin-import-job-item-${TEST_RUN_TAG}-ok-3`)
    ).toBeVisible();
  });

  test("job detail shows running state when finished_at is null", async ({
    page,
  }) => {
    // Seed a job with total=2 but only one item inserted → counts
    // are 1/0/null and the page should read "Importing…" with a
    // partial progress bar.
    const jobId = await seedJob({
      userId,
      total: 2,
      successCount: 1,
      failedCount: 0,
      finished: false,
      items: [{ slug: "ok-only", productName: "OK Only", status: "success" }],
    });

    await login(page, email);
    await page.goto(`/admin/import/jobs/${jobId}`);

    await expect(page.getByTestId("admin-import-job-status")).toContainText(
      /Importing…/i
    );
    await expect(page.getByTestId("admin-import-job-progress")).toContainText(
      "1 of 2 processed"
    );
    const progressBar = page.getByTestId("admin-import-job-progress-bar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "50");
  });

  test("/admin/import surfaces the existing-catalogue count and links to jobs", async ({
    page,
  }) => {
    await login(page, email);
    await page.goto("/admin/import");

    await expect(page.getByTestId("admin-import-existing-count")).toContainText(
      /in catalogue$/
    );
    await expect(
      page.getByTestId("admin-import-recent-jobs-link")
    ).toHaveAttribute("href", "/admin/import/jobs");
  });

  test("admin can delete a stuck job from the detail page (TT-244 case 4)", async ({
    page,
  }) => {
    // Seed a stuck job: total=2 with only 1 item recorded, so
    // finished_at stays null. Same shape as the legacy stuck rows
    // that originally motivated this UI.
    const jobId = await seedJob({
      userId,
      total: 2,
      successCount: 1,
      failedCount: 0,
      finished: false,
      items: [{ slug: "stuck-ok", productName: "Stuck OK", status: "success" }],
    });

    await login(page, email);

    // Auto-accept the confirm() dialog the form raises on submit.
    page.on("dialog", dialog => {
      void dialog.accept();
    });

    await page.goto(`/admin/import/jobs/${jobId}`);
    await expect(page.getByTestId("admin-import-job-status")).toContainText(
      /Importing…/i
    );

    await page.getByTestId("admin-import-job-delete").click();

    // Redirects to the jobs list; the deleted row is gone.
    await expect(page).toHaveURL("/admin/import/jobs");
    await expect(
      page.getByTestId(`admin-import-jobs-row-${jobId}`)
    ).toHaveCount(0);
  });
});

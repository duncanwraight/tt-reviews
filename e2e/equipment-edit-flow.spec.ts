import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

/**
 * TT-105 — equipment_edit submission flow end-to-end.
 *
 * Both paths run serially: the FORM_SUBMISSION rate limiter is keyed
 * by client IP, and Playwright's loopback IP is shared across workers
 * — running in parallel quickly trips the 5-per-minute cap.
 *
 *   1. submitter creates an edit → admin approves via UI → equipment row
 *      reflects the proposed changes
 *   2. submitter creates an edit → admin rejects via UI → equipment row
 *      is unchanged
 *
 * Both tests use admin submitters so the rate limiter doesn't bite
 * across the suite — the flow under test (form pre-fill, diff packing,
 * applier writes, rejection cleanup) is independent of the submitter's
 * role.
 */
test.describe.configure({ mode: "serial" });

interface CreatedEquipment {
  id: string;
  slug: string;
}

async function createTestEquipment(
  name: string,
  manufacturer: string
): Promise<CreatedEquipment> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment`, {
    method: "POST",
    headers: {
      ...adminHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      slug,
      category: "rubber",
      subcategory: "inverted",
      manufacturer,
      specifications: { speed: 8.5, control: 7.5 },
      description: "Original description",
      // Pretend an image already exists so the form defaults
      // image_action to "keep" and doesn't require a file upload.
      // The applier on approval doesn't touch image_key when action=
      // keep, so the fake key never has to resolve.
      image_key: "equipment/test/fake.png",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`equipment insert failed (${res.status}): ${text}`);
  }
  const rows = (await res.json()) as Array<{ id: string; slug: string }>;
  return rows[0];
}

async function deleteTestEquipment(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/equipment?id=eq.${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

async function fetchEquipment(id: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?id=eq.${id}&select=name,slug,description,specifications`,
    { headers: adminHeaders() }
  );
  if (!res.ok) throw new Error(`equipment fetch failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    name: string;
    slug: string;
    description: string | null;
    specifications: Record<string, unknown> | null;
  }>;
  return rows[0];
}

test("equipment_edit: submit → admin approves → equipment row reflects change", async ({
  page,
  browser,
}) => {
  const submitterEmail = generateTestEmail("ee-sub");
  const adminEmail = generateTestEmail("ee-adm");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");
  // Submitter is also admin to skip the IP-keyed FORM_SUBMISSION rate
  // limiter — see the suite docstring above.
  await setUserRole(submitterId, "admin");

  const uniqueName = `e2e Edit Rubber ${Date.now()}`;
  const equipment = await createTestEquipment(uniqueName, "E2E Co");
  const newDescription = "Updated description from edit flow.";

  try {
    // 1. Submitter goes to the equipment detail page → "Suggest an edit".
    await login(page, submitterEmail);
    await page.goto(
      `/submissions/equipment_edit/submit?equipment_id=${equipment.id}`
    );

    // Form pre-fills from current values; tweak description + one spec.
    // Playwright fill on a controlled React textarea pre-filled by the
    // loader leaves the original text in place — clear explicitly first.
    const descField = page.getByLabel(/^Description/i);
    await descField.click();
    await descField.press("Control+a");
    await descField.fill(newDescription);

    // Speed input (typed numeric, current 8.5). Fill with a new value.
    const speedInput = page.locator('input[name="spec_speed"]');
    await speedInput.fill("9.2");

    // edit_reason is required.
    await page.getByLabel(/^Reason for Changes/i).fill("e2e test edit");

    await page.getByRole("button", { name: /Submit Changes/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    // 2. equipment_edits row carries the diff (description + speed).
    const editsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_edits?user_id=eq.${submitterId}&select=id,edit_data,status`,
      { headers: adminHeaders() }
    );
    const edits = (await editsRes.json()) as Array<{
      id: string;
      edit_data: Record<string, unknown>;
      status: string;
    }>;
    expect(edits).toHaveLength(1);
    expect(edits[0].edit_data.description).toBe(newDescription);
    expect(edits[0].edit_data).toMatchObject({
      specifications: expect.objectContaining({ speed: 9.2 }),
    });

    // 3. Admin approves via the moderation queue.
    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/equipment-edits");

    const card = page.locator("li").filter({ hasText: uniqueName }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^Approve$/ }).click();

    // 4. Equipment row reflects the change.
    await expect
      .poll(
        async () => {
          const row = await fetchEquipment(equipment.id);
          return row.description;
        },
        { timeout: 15000 }
      )
      .toBe(newDescription);

    const finalRow = await fetchEquipment(equipment.id);
    expect((finalRow.specifications as { speed: number }).speed).toBe(9.2);
    // control stayed put.
    expect((finalRow.specifications as { control: number }).control).toBe(7.5);

    // 5. Public detail page surfaces the new description.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`/equipment/${finalRow.slug}`);
      await expect(anonPage.getByText(newDescription)).toBeVisible();
    } finally {
      await anonContext.close();
    }
  } finally {
    await deleteTestEquipment(equipment.id);
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

// Smallest legal PNG: 1x1 transparent. setInputFiles takes a Buffer
// so we don't need a real file on disk.
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082",
  "hex"
);

test("equipment_edit: image replace shows single error when file missing, then submits + applies on approval", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("ee-img-sub");
  const adminEmail = generateTestEmail("ee-img-adm");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");
  await setUserRole(submitterId, "admin");

  const uniqueName = `e2e Image Rubber ${Date.now()}`;
  const equipment = await createTestEquipment(uniqueName, "E2E Co");

  try {
    await login(page, submitterEmail);
    await page.goto(
      `/submissions/equipment_edit/submit?equipment_id=${equipment.id}`
    );

    // 1. Switch to "Replace with a new upload" but don't pick a file.
    //    Use name attribute — the visible label "Image*" makes label
    //    matching brittle against the required-marker span.
    await page.locator('select[name="image_action"]').selectOption("replace");
    await page.getByLabel(/^Reason for Changes/i).fill("swap image");
    await page.getByRole("button", { name: /Submit Changes/i }).click();

    // Expect EXACTLY one "is required" error for the image field — the
    // earlier double-render was caused by both ImageUpload and the
    // FormField wrapper showing the same error.
    const requiredErrors = page.getByText(/New Product Image is required/i);
    await expect(requiredErrors).toHaveCount(1);
    // Form should still be on the same URL — submission was blocked.
    expect(page.url()).toContain("/submissions/equipment_edit/submit");

    // 2. Provide a file. Submission goes through.
    await page.locator('input[type="file"][name="image"]').setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByRole("button", { name: /Submit Changes/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    // 3. Admin approves.
    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/equipment-edits");

    const card = page.locator("li").filter({ hasText: uniqueName }).first();
    await card.getByRole("button", { name: /^Approve$/ }).click();

    // 4. Equipment row's image_key was promoted from the staged path
    //    onto a canonical equipment/<slug>/<ts>.png location.
    await expect
      .poll(
        async () => {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/equipment?id=eq.${equipment.id}&select=image_key`,
            { headers: adminHeaders() }
          );
          const rows = (await res.json()) as Array<{
            image_key: string | null;
          }>;
          return rows[0]?.image_key;
        },
        { timeout: 15000 }
      )
      .toMatch(/^equipment\/[a-z0-9-]+\/\d+\.png$/);

    // It must NOT still be the old fake key — the applier should have
    // replaced it with the new canonical key.
    const finalRow = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment?id=eq.${equipment.id}&select=image_key`,
      { headers: adminHeaders() }
    );
    const rows = (await finalRow.json()) as Array<{ image_key: string }>;
    expect(rows[0].image_key).not.toBe("equipment/test/fake.png");
  } finally {
    await deleteTestEquipment(equipment.id);
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

test("equipment_edit: submit → admin rejects → equipment row unchanged", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("ee-rej-sub");
  const adminEmail = generateTestEmail("ee-rej-adm");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");
  // Submitter is also admin to skip the IP-keyed FORM_SUBMISSION rate
  // limiter — see the suite docstring above.
  await setUserRole(submitterId, "admin");

  const uniqueName = `e2e Reject Rubber ${Date.now()}`;
  const equipment = await createTestEquipment(uniqueName, "E2E Co");
  const originalDescription = "Original description";

  try {
    await login(page, submitterEmail);
    await page.goto(
      `/submissions/equipment_edit/submit?equipment_id=${equipment.id}`
    );
    const desc = page.getByLabel(/^Description/i);
    await desc.click();
    await desc.press("Control+a");
    await desc.fill("Some bogus rewrite");
    await page.getByLabel(/^Reason for Changes/i).fill("trying to vandalise");
    await page.getByRole("button", { name: /Submit Changes/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/equipment-edits");

    const card = page.locator("li").filter({ hasText: uniqueName }).first();
    await card.getByRole("button", { name: /^Reject$/ }).click();
    await page
      .getByLabel(/Detailed Reason/i)
      .fill("e2e — rejecting on purpose");
    await page.getByRole("button", { name: /Reject Submission/i }).click();

    // Edit row marked rejected; equipment row's description stayed.
    await expect
      .poll(
        async () => {
          const editsRes = await fetch(
            `${SUPABASE_URL}/rest/v1/equipment_edits?user_id=eq.${submitterId}&select=status`,
            { headers: adminHeaders() }
          );
          const rows = (await editsRes.json()) as Array<{ status: string }>;
          return rows[0]?.status;
        },
        { timeout: 10000 }
      )
      .toBe("rejected");

    const finalRow = await fetchEquipment(equipment.id);
    expect(finalRow.description).toBe(originalDescription);
  } finally {
    await deleteTestEquipment(equipment.id);
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

import { test, expect } from "@playwright/test";

import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  deleteSpecProposalsForEquipment,
  getEquipmentSpecsAndDescription,
  getFirstEquipment,
  getSpecProposal,
  insertSpecProposal,
  setEquipmentSpecsCooldown,
} from "./utils/data";

// TT-150: admin manufacturer-specs review flow. End-to-end coverage
// that the SECURITY DEFINER apply / reject RPCs are wired correctly —
// mocked-Supabase unit tests cover validation, this test catches
// PostgREST shape bugs (RPC argument names, return shape, RLS reads).
//
// Serial because both tests mutate the same equipment row's cooldown
// + specifications columns; running in parallel would let one test's
// reset clobber the other mid-flight.

const VISCARIA_PROPOSAL = {
  specs: {
    weight: 89,
    plies_wood: 5,
    plies_composite: 2,
    composite_material: "Arylate Carbon",
  },
  description: "Legendary all-round blade.",
  per_field_source: {
    weight: "https://en.butterfly.tt/viscaria.html",
    plies_wood: "https://en.butterfly.tt/viscaria.html",
    plies_composite: "https://en.butterfly.tt/viscaria.html",
    composite_material: "https://en.butterfly.tt/viscaria.html",
    description: "https://en.butterfly.tt/viscaria.html",
  },
};

test.describe.configure({ mode: "serial" });

test.describe("Admin manufacturer-specs review", () => {
  test("Apply writes specs + description and marks proposal applied", async ({
    page,
  }) => {
    const equipment = await getFirstEquipment();
    const before = await getEquipmentSpecsAndDescription(equipment.id);

    await deleteSpecProposalsForEquipment(equipment.id);
    const proposal = await insertSpecProposal({
      equipmentId: equipment.id,
      merged: VISCARIA_PROPOSAL,
    });
    // Stamp pending_review on the equipment row so the dashboard / cron
    // pick logic matches what the live cron would have written.
    await setEquipmentSpecsCooldown(equipment.id, {
      specs_source_status: "pending_review",
      specs_sourced_at: new Date().toISOString(),
    });

    const adminEmail = generateTestEmail("specprop-apply");
    const { userId } = await createUser(adminEmail);
    await setUserRole(userId, "admin");

    try {
      await login(page, adminEmail);

      await page.goto("/admin/manufacturer-specs");
      await expect(
        page.getByTestId(`manufacturer-spec-row-${proposal.id}`)
      ).toBeVisible();

      await page.getByTestId(`manufacturer-spec-review-${proposal.id}`).click();
      await page.waitForURL(`**/admin/manufacturer-specs/${proposal.id}`);

      // Defaults are pre-filled from merged.
      await expect(page.getByLabel(/Weight/)).toHaveValue("89");
      await expect(page.getByLabel(/Plies \(wood\)/)).toHaveValue("5");
      await expect(page.getByTestId("spec-description")).toHaveValue(
        "Legendary all-round blade."
      );

      // Edit one numeric field to verify it persists through validation.
      await page.getByLabel(/Weight/).fill("90");

      await page.getByTestId("manufacturer-spec-apply").click();
      await page.waitForURL(/\/admin\/manufacturer-specs$/);

      const after = await getEquipmentSpecsAndDescription(equipment.id);
      expect(after.specifications).toMatchObject({
        weight: 90,
        plies_wood: 5,
        plies_composite: 2,
        composite_material: "Arylate Carbon",
      });
      expect(after.description).toBe("Legendary all-round blade.");
      expect(after.specs_source_status).toBe("fresh");

      const proposalAfter = await getSpecProposal(proposal.id);
      expect(proposalAfter?.status).toBe("applied");
      expect(proposalAfter?.reviewed_by).toBe(userId);
      expect(proposalAfter?.reviewed_at).not.toBeNull();
    } finally {
      // Restore the equipment row to its pre-test state.
      await setEquipmentSpecsCooldown(equipment.id, {
        specifications: before.specifications,
        description: before.description,
        specs_source_status: before.specs_source_status,
        specs_sourced_at: before.specs_sourced_at,
      });
      await deleteSpecProposalsForEquipment(equipment.id);
      await deleteUser(userId);
    }
  });

  test("Reject leaves equipment.* untouched and stamps no_results cooldown", async ({
    page,
  }) => {
    const equipment = await getFirstEquipment();
    const before = await getEquipmentSpecsAndDescription(equipment.id);

    await deleteSpecProposalsForEquipment(equipment.id);
    const proposal = await insertSpecProposal({
      equipmentId: equipment.id,
      merged: VISCARIA_PROPOSAL,
    });
    await setEquipmentSpecsCooldown(equipment.id, {
      specs_source_status: "pending_review",
      specs_sourced_at: new Date().toISOString(),
    });

    const adminEmail = generateTestEmail("specprop-reject");
    const { userId } = await createUser(adminEmail);
    await setUserRole(userId, "admin");

    try {
      await login(page, adminEmail);
      await page.goto(`/admin/manufacturer-specs/${proposal.id}`);

      await page.getByTestId("manufacturer-spec-reject").click();
      await page.waitForURL(/\/admin\/manufacturer-specs$/);

      const after = await getEquipmentSpecsAndDescription(equipment.id);
      expect(after.specifications).toEqual(before.specifications);
      expect(after.description).toBe(before.description);
      expect(after.specs_source_status).toBe("no_results");

      const proposalAfter = await getSpecProposal(proposal.id);
      expect(proposalAfter?.status).toBe("rejected");
      expect(proposalAfter?.reviewed_by).toBe(userId);
    } finally {
      await setEquipmentSpecsCooldown(equipment.id, {
        specifications: before.specifications,
        description: before.description,
        specs_source_status: before.specs_source_status,
        specs_sourced_at: before.specs_sourced_at,
      });
      await deleteSpecProposalsForEquipment(equipment.id);
      await deleteUser(userId);
    }
  });
});

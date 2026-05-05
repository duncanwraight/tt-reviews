import { test, expect } from "@playwright/test";

import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  createTestEquipment,
  deleteEquipment,
  deleteSpecProposalsForEquipment,
  getEquipmentSpecsAndDescription,
  getSpecProposal,
  insertSpecProposal,
  setEquipmentSpecsCooldown,
} from "./utils/data";

// TT-150: admin manufacturer-specs review flow. End-to-end coverage
// that the SECURITY DEFINER apply / reject RPCs are wired correctly —
// mocked-Supabase unit tests cover validation, this test catches
// PostgREST shape bugs (RPC argument names, return shape, RLS reads).
//
// TT-177: each test creates its own hermetic blade equipment row to
// avoid colliding with admin-equipment-requeue.spec.ts, which used to
// share the same `getFirstEquipmentByCategory("blade")` row and
// race-mutate `specs_source_status` under parallel workers.

const VISCARIA_PROPOSAL = {
  specs: {
    weight: 89,
    plies_wood: 5,
    plies_composite: 2,
    material: "Arylate Carbon",
  },
  description: "Legendary all-round blade.",
  per_field_source: {
    weight: "https://en.butterfly.tt/viscaria.html",
    plies_wood: "https://en.butterfly.tt/viscaria.html",
    plies_composite: "https://en.butterfly.tt/viscaria.html",
    material: "https://en.butterfly.tt/viscaria.html",
    description: "https://en.butterfly.tt/viscaria.html",
  },
};

test.describe("Admin manufacturer-specs review", () => {
  test("Apply writes specs + description and marks proposal applied", async ({
    page,
  }) => {
    // Proposal payload is blade-shaped (plies/material), and the
    // admin form only renders fields configured for the equipment's
    // category — so we must target a blade row.
    const equipment = await createTestEquipment("specprop-apply", "blade");

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
        material: "Arylate Carbon",
      });
      expect(after.description).toBe("Legendary all-round blade.");
      expect(after.specs_source_status).toBe("fresh");

      const proposalAfter = await getSpecProposal(proposal.id);
      expect(proposalAfter?.status).toBe("applied");
      expect(proposalAfter?.reviewed_by).toBe(userId);
      expect(proposalAfter?.reviewed_at).not.toBeNull();
    } finally {
      await deleteSpecProposalsForEquipment(equipment.id);
      await deleteEquipment(equipment.id);
      await deleteUser(userId);
    }
  });

  test("Run log section renders pipeline decisions for the proposal (TT-162)", async ({
    page,
  }) => {
    const equipment = await createTestEquipment("specprop-runlog", "blade");

    const proposal = await insertSpecProposal({
      equipmentId: equipment.id,
      merged: VISCARIA_PROPOSAL,
      runLog: [
        {
          at: "2026-05-04T08:00:00.000Z",
          step: "source_skipped_brand",
          source_id: "stiga",
          source_brand: "Stiga",
          equipment_brand: "Butterfly",
        },
        {
          at: "2026-05-04T08:00:01.000Z",
          step: "source_started",
          source_id: "butterfly",
          source_tier: 1,
          source_kind: "manufacturer",
        },
        {
          at: "2026-05-04T08:00:02.000Z",
          step: "search",
          source_id: "butterfly",
          query_url: "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria",
          status: "ok",
          count: 1,
          candidates: [
            {
              url: "https://en.butterfly.tt/viscaria.html",
              title: "Viscaria",
            },
          ],
        },
        {
          at: "2026-05-04T08:00:03.000Z",
          step: "prefilter",
          source_id: "butterfly",
          seed_tokens: ["viscaria"],
          brand_tokens: ["butterfly"],
          kept: [
            {
              url: "https://en.butterfly.tt/viscaria.html",
              title: "Viscaria",
            },
          ],
          dropped: [],
        },
        {
          at: "2026-05-04T08:00:04.000Z",
          step: "extract",
          source_id: "butterfly",
          candidate_url: "https://en.butterfly.tt/viscaria.html",
          status: "ok",
          fields_count: 4,
          has_description: true,
          uncertain_fields: [],
          excerpt: "<html><body>Viscaria spec page</body></html>",
          failure_reason: "ok",
          tokens: 1234,
          http_status: 200,
        },
        {
          at: "2026-05-04T08:00:04.500Z",
          step: "source_started",
          source_id: "tt11",
          source_tier: 2,
          source_kind: "retailer",
        },
        {
          at: "2026-05-04T08:00:04.600Z",
          step: "search",
          source_id: "tt11",
          query_url:
            "https://www.tabletennis11.com/catalogsearch/result/?q=Butterfly+Viscaria",
          status: "ok",
          count: 1,
          candidates: [
            {
              url: "https://www.tabletennis11.com/butterfly-viscaria",
              title: "Butterfly Viscaria",
            },
          ],
        },
        {
          at: "2026-05-04T08:00:04.700Z",
          step: "extract",
          source_id: "tt11",
          candidate_url: "https://www.tabletennis11.com/butterfly-viscaria",
          status: "null_result",
          excerpt: "<html><body>Out of stock</body></html>",
          failure_reason: "schema_invalid",
          validation_detail: "missing or non-object `specs` field",
          raw_response: '{"description":"Just a blurb, no specs"}',
          tokens: 980,
          http_status: 200,
        },
        {
          at: "2026-05-04T08:00:05.000Z",
          step: "contribution",
          source_id: "butterfly",
          candidate_url: "https://en.butterfly.tt/viscaria.html",
          fields: ["weight", "plies_wood", "plies_composite", "material"],
          description: true,
        },
        {
          at: "2026-05-04T08:00:06.000Z",
          step: "outcome",
          status: "proposed",
          merged_field_count: 5,
        },
      ],
    });
    await setEquipmentSpecsCooldown(equipment.id, {
      specs_source_status: "pending_review",
      specs_sourced_at: new Date().toISOString(),
    });

    const adminEmail = generateTestEmail("specprop-runlog");
    const { userId } = await createUser(adminEmail);
    await setUserRole(userId, "admin");

    try {
      await login(page, adminEmail);
      await page.goto(`/admin/manufacturer-specs/${proposal.id}`);

      const runLog = page.getByTestId("spec-sourcing-run-log");
      await expect(runLog).toBeVisible();

      // Brand-skip pre-section names the skipped source.
      await expect(runLog).toContainText("stiga");

      // Per-source group renders for butterfly.
      await expect(page.getByTestId("run-log-source-butterfly")).toBeVisible();

      // Search query URL is surfaced as a clickable diagnostic link.
      await expect(
        page.getByRole("link", {
          name: "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria",
        })
      ).toBeVisible();

      // Outcome footer reflects the terminal status.
      await expect(page.getByTestId("run-log-outcome")).toContainText(
        "proposed"
      );

      // LLM diagnostics on the tt11 null_result extract (TT-162):
      // failure pill, validation detail, and raw_response disclosure.
      const tt11 = page.getByTestId("run-log-source-tt11");
      await expect(tt11).toContainText("schema_invalid");
      await expect(tt11).toContainText("missing or non-object");
      await expect(tt11).toContainText("Raw response from the LLM");
    } finally {
      await deleteSpecProposalsForEquipment(equipment.id);
      await deleteEquipment(equipment.id);
      await deleteUser(userId);
    }
  });

  test("Reject leaves equipment.* untouched and stamps no_results cooldown", async ({
    page,
  }) => {
    const equipment = await createTestEquipment("specprop-reject", "blade");
    const before = await getEquipmentSpecsAndDescription(equipment.id);

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
      await deleteSpecProposalsForEquipment(equipment.id);
      await deleteEquipment(equipment.id);
      await deleteUser(userId);
    }
  });
});

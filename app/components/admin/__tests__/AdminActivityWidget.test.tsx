// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminActivityEntry } from "~/lib/admin/activity.server";
import { AdminActivityWidget } from "../AdminActivityWidget";

function entry(overrides: Partial<AdminActivityEntry>): AdminActivityEntry {
  return {
    id: overrides.id ?? "a1",
    action: overrides.action ?? "approved",
    submissionType: overrides.submissionType ?? "equipment",
    submissionId: overrides.submissionId ?? "s1",
    actor: overrides.actor ?? "alice@example.com",
    source: overrides.source ?? "admin_ui",
    createdAt: overrides.createdAt ?? "2026-04-26T12:00:00Z",
  };
}

describe("AdminActivityWidget", () => {
  it("renders the empty state when there are no entries", () => {
    render(<AdminActivityWidget entries={[]} />);
    expect(
      screen.getByText(/no moderation actions recorded yet/i)
    ).toBeInTheDocument();
  });

  it("renders one row per entry with action label, actor, source, and timestamp", () => {
    render(
      <AdminActivityWidget
        entries={[
          entry({
            id: "a1",
            actor: "alice@example.com",
            action: "approved",
            submissionType: "equipment",
            source: "admin_ui",
            createdAt: "2026-04-26T12:00:00Z",
          }),
          entry({
            id: "a2",
            actor: "bob",
            action: "rejected",
            submissionType: "video",
            source: "discord",
            createdAt: "2026-04-25T08:00:00Z",
          }),
        ]}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // Line 1: coloured-bold entity + bold action verb.
    // Line 2: "by" + bold moderator + "(source)" + light-grey timestamp.
    expect(items[0].textContent).toContain("Equipment submission approved");
    expect(items[0].textContent).toContain("by alice@example.com (Admin UI)");
    expect(items[1].textContent).toContain("Video submission rejected");
    expect(items[1].textContent).toContain("by bob (Discord)");

    // Entity label has the per-type colour class.
    expect(screen.getByText("Equipment submission")).toHaveClass(
      "text-orange-700"
    );
    expect(screen.getByText("Video submission")).toHaveClass("text-rose-700");

    // Timestamps include time, in DD/MM/YYYY, HH:mm form. The exact hour
    // depends on the runner's local timezone (Intl renders in local time)
    // — match the pattern, not a fixed value, so the test is portable.
    expect(screen.getByText(/^26\/04\/2026, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText(/^25\/04\/2026, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("uses distinct icons for approved vs rejected actions", () => {
    render(
      <AdminActivityWidget
        entries={[
          entry({ id: "a1", action: "approved" }),
          entry({ id: "a2", action: "rejected" }),
        ]}
      />
    );

    expect(screen.getByLabelText("approved")).toBeInTheDocument();
    expect(screen.getByLabelText("rejected")).toBeInTheDocument();
  });
});

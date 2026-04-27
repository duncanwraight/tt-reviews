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

  it("renders one row per entry with actor, action, type, and timestamp", () => {
    render(
      <AdminActivityWidget
        entries={[
          entry({
            id: "a1",
            actor: "alice@example.com",
            action: "approved",
            submissionType: "equipment",
            createdAt: "2026-04-26T12:00:00Z",
          }),
          entry({
            id: "a2",
            actor: "bob (Discord)",
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

    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByText(/approved a equipment submission/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/bob \(Discord\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/rejected a video submission/i)
    ).toBeInTheDocument();
    expect(screen.getByText("26/04/2026")).toBeInTheDocument();
    expect(screen.getByText("25/04/2026")).toBeInTheDocument();
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

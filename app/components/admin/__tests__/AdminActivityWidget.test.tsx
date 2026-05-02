// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { AdminActivityEntry } from "~/lib/admin/activity.server";
import { AdminActivityWidget } from "../AdminActivityWidget";

function entry(overrides: Partial<AdminActivityEntry>): AdminActivityEntry {
  // viewUrl can legitimately be `null` (rejected new submission), so
  // use an `in` check rather than `??` which would treat null as
  // "use the default URL".
  return {
    id: overrides.id ?? "a1",
    action: overrides.action ?? "approved",
    submissionType: overrides.submissionType ?? "equipment",
    submissionId: overrides.submissionId ?? "s1",
    actor: overrides.actor ?? "alice@example.com",
    source: overrides.source ?? "admin_ui",
    viewUrl:
      "viewUrl" in overrides
        ? (overrides.viewUrl ?? null)
        : "/equipment/example",
    createdAt: overrides.createdAt ?? "2026-04-26T12:00:00Z",
  };
}

function renderWidget(entries: AdminActivityEntry[]) {
  return render(
    <MemoryRouter>
      <AdminActivityWidget entries={entries} />
    </MemoryRouter>
  );
}

describe("AdminActivityWidget", () => {
  it("renders the empty state when there are no entries", () => {
    renderWidget([]);
    expect(
      screen.getByText(/no moderation actions recorded yet/i)
    ).toBeInTheDocument();
  });

  it("renders one row per entry with linked entity label, actor, source icon, and timestamp", () => {
    renderWidget([
      entry({
        id: "a1",
        actor: "alice@example.com",
        action: "approved",
        submissionType: "equipment_edit",
        source: "admin_ui",
        viewUrl: "/equipment/hurricane-3",
        createdAt: "2026-04-26T12:00:00Z",
      }),
      entry({
        id: "a2",
        actor: "bob",
        action: "rejected",
        submissionType: "video",
        source: "discord",
        viewUrl: "/players/ma-long",
        createdAt: "2026-04-25T08:00:00Z",
      }),
    ]);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // Entity label is now a link to the public view page; the
    // "approved/rejected" verb and the "(Admin UI)/(Discord)" suffix
    // were dropped — the icons carry that signal.
    const editLink = screen.getByRole("link", { name: "Equipment edit" });
    expect(editLink).toHaveAttribute("href", "/equipment/hurricane-3");
    expect(editLink).toHaveClass("text-amber-700");

    const videoLink = screen.getByRole("link", { name: "Video submission" });
    expect(videoLink).toHaveAttribute("href", "/players/ma-long");
    expect(videoLink).toHaveClass("text-rose-700");

    expect(items[0].textContent).toContain("alice@example.com");
    expect(items[0].textContent).not.toContain("(Admin UI)");
    expect(items[0].textContent).not.toContain("approved");
    expect(items[1].textContent).toContain("bob");
    expect(items[1].textContent).not.toContain("(Discord)");
    expect(items[1].textContent).not.toContain("rejected");

    // Timestamps include time, in DD/MM/YYYY, HH:mm form. The exact hour
    // depends on the runner's local timezone (Intl renders in local time)
    // — match the pattern, not a fixed value, so the test is portable.
    expect(screen.getByText(/^26\/04\/2026, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText(/^25\/04\/2026, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("uses distinct icons for approved vs rejected actions", () => {
    renderWidget([
      entry({ id: "a1", action: "approved" }),
      entry({ id: "a2", action: "rejected" }),
    ]);

    expect(screen.getByLabelText("approved")).toBeInTheDocument();
    expect(screen.getByLabelText("rejected")).toBeInTheDocument();
  });

  it("uses distinct icons for admin-UI vs Discord sources", () => {
    renderWidget([
      entry({ id: "a1", source: "admin_ui" }),
      entry({ id: "a2", source: "discord" }),
    ]);

    expect(screen.getByLabelText("admin ui")).toBeInTheDocument();
    expect(screen.getByLabelText("discord")).toBeInTheDocument();
  });

  it("renders entity label as plain text when viewUrl is null (e.g. approved row with an orphaned source)", () => {
    renderWidget([
      entry({
        id: "a1",
        submissionType: "equipment",
        action: "approved",
        viewUrl: null,
      }),
    ]);

    expect(
      screen.queryByRole("link", { name: "Equipment submission" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Equipment submission")).toHaveClass(
      "text-orange-700"
    );
  });

  it("links rejected rows to the admin queue page", () => {
    renderWidget([
      entry({
        id: "a1",
        submissionType: "equipment_edit",
        action: "rejected",
        viewUrl: "/admin/equipment-edits",
      }),
    ]);

    const link = screen.getByRole("link", { name: "Equipment edit" });
    expect(link).toHaveAttribute("href", "/admin/equipment-edits");
  });
});

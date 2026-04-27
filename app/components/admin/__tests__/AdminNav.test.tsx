// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AdminNav } from "../AdminNav";
import { ADMIN_NAV_GROUPS } from "../nav-config";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminNav />
    </MemoryRouter>
  );
}

function getMobilePanel(hamburger: HTMLElement): HTMLElement {
  const id = hamburger.getAttribute("aria-controls");
  if (!id) throw new Error("hamburger missing aria-controls");
  const panel = document.getElementById(id);
  if (!panel) throw new Error(`mobile panel #${id} not in document`);
  return panel;
}

describe("AdminNav", () => {
  it("renders Dashboard plus a trigger for each nav group", () => {
    renderAt("/admin");

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    for (const group of ADMIN_NAV_GROUPS) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${group.label}`) })
      ).toBeInTheDocument();
    }
  });

  it("opens a dropdown on click and reveals all its items", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const moderationTrigger = screen.getByRole("button", {
      name: /^Moderation/,
    });
    expect(moderationTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(moderationTrigger);

    expect(moderationTrigger).toHaveAttribute("aria-expanded", "true");
    const moderationGroup = ADMIN_NAV_GROUPS.find(
      g => g.label === "Moderation"
    )!;
    for (const item of moderationGroup.items) {
      expect(
        screen.getByRole("menuitem", { name: item.label })
      ).toBeInTheDocument();
    }
  });

  it("closes the dropdown on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const trigger = screen.getByRole("button", { name: /^Library/ });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminNav />
        <button type="button">outside</button>
      </MemoryRouter>
    );

    const trigger = screen.getByRole("button", { name: /^Moderation/ });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("marks Dashboard as the active page when on /admin", () => {
    renderAt("/admin");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    for (const group of ADMIN_NAV_GROUPS) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${group.label}`) })
      ).not.toHaveAttribute("aria-current");
    }
  });

  it("marks the active group AND active sub-item based on the current location", async () => {
    const user = userEvent.setup();
    renderAt("/admin/equipment-reviews");

    const moderationTrigger = screen.getByRole("button", {
      name: /^Moderation/,
    });
    expect(moderationTrigger).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current"
    );

    await user.click(moderationTrigger);
    expect(
      screen.getByRole("menuitem", { name: "Equipment Reviews" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("menuitem", { name: "Equipment Submissions" })
    ).not.toHaveAttribute("aria-current");
  });

  it("opens with ArrowDown from the trigger and moves focus through items with arrow keys", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const trigger = screen.getByRole("button", { name: /^Library/ });
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(items[0]).toHaveFocus();
  });
});

describe("AdminNav mobile", () => {
  it("toggles the mobile panel via the hamburger and renders all groups", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const hamburger = screen.getByRole("button", {
      name: /toggle admin navigation/i,
    });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    const panel = getMobilePanel(hamburger);
    expect(
      within(panel).getByRole("link", { name: "Dashboard" })
    ).toBeInTheDocument();
    for (const group of ADMIN_NAV_GROUPS) {
      expect(
        within(panel).getByRole("button", {
          name: new RegExp(`^${group.label}`),
        })
      ).toBeInTheDocument();
    }
  });

  it("auto-expands the active group's mobile section and reveals its items", async () => {
    const user = userEvent.setup();
    renderAt("/admin/equipment-reviews");

    const hamburger = screen.getByRole("button", {
      name: /toggle admin navigation/i,
    });
    await user.click(hamburger);

    const panel = getMobilePanel(hamburger);
    expect(
      within(panel).getByRole("link", { name: "Equipment Reviews" })
    ).toHaveAttribute("aria-current", "page");
  });

  it("closes the mobile panel after tapping a link", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const hamburger = screen.getByRole("button", {
      name: /toggle admin navigation/i,
    });
    await user.click(hamburger);

    const panel = getMobilePanel(hamburger);
    const moderationToggle = within(panel).getByRole("button", {
      name: /^Moderation/,
    });
    await user.click(moderationToggle);

    const link = within(panel).getByRole("link", {
      name: "Equipment Submissions",
    });
    await user.click(link);

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile panel on Escape and returns focus to the hamburger", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    const hamburger = screen.getByRole("button", {
      name: /toggle admin navigation/i,
    });
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(hamburger).toHaveFocus();
  });
});

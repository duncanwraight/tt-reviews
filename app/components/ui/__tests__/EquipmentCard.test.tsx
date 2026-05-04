// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { EquipmentCard } from "../EquipmentCard";
import { ComparisonProvider } from "~/contexts/ComparisonContext";

function renderCard(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <ComparisonProvider>{ui}</ComparisonProvider>
    </MemoryRouter>
  );
}

const baseRubber = {
  id: "eq-1",
  name: "Tenergy 05",
  slug: "butterfly-tenergy-05",
  category: "rubber",
  subcategory: "inverted",
  manufacturer: "Butterfly",
};

const baseBlade = {
  id: "eq-2",
  name: "Viscaria",
  slug: "butterfly-viscaria",
  category: "blade",
  manufacturer: "Butterfly",
};

describe("EquipmentCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses line-clamp-2 on the title (no truncation)", () => {
    renderCard(<EquipmentCard equipment={baseBlade} />);
    const title = screen.getByRole("heading", { name: "Butterfly Viscaria" });
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
  });

  it("does not render the manufacturer anywhere in the card", () => {
    renderCard(<EquipmentCard equipment={baseBlade} />);
    expect(screen.queryByText("Butterfly")).not.toBeInTheDocument();
  });

  it("renders both pills with a literal • for a rubber with subcategory", () => {
    const { container } = renderCard(<EquipmentCard equipment={baseRubber} />);
    expect(screen.getByText("Rubber")).toBeInTheDocument();
    expect(screen.getByText("Inverted")).toBeInTheDocument();
    expect(container.textContent).toContain("•");
  });

  it("renders only the category pill (no •) for a blade with no subcategory", () => {
    const { container } = renderCard(<EquipmentCard equipment={baseBlade} />);
    expect(screen.getByText("Blade")).toBeInTheDocument();
    expect(container.textContent).not.toContain("•");
  });

  it("renders stars + numeric rating when reviewCount > 0", () => {
    renderCard(
      <EquipmentCard
        equipment={{ ...baseRubber, rating: 4.6, reviewCount: 12 }}
      />
    );
    expect(screen.getByText("4.6 (12 reviews)")).toBeInTheDocument();
  });

  it("renders no rating row when reviewCount is 0", () => {
    renderCard(
      <EquipmentCard
        equipment={{ ...baseRubber, rating: 4.6, reviewCount: 0 }}
      />
    );
    expect(screen.queryByText(/reviews?\)/)).not.toBeInTheDocument();
  });

  it("renders no rating row when reviewCount is undefined", () => {
    renderCard(<EquipmentCard equipment={baseRubber} />);
    expect(screen.queryByText(/reviews?\)/)).not.toBeInTheDocument();
  });

  it("does not render the comparison toggle by default", () => {
    renderCard(<EquipmentCard equipment={baseRubber} />);
    expect(screen.queryByTestId("comparison-toggle")).not.toBeInTheDocument();
  });

  it("renders the comparison toggle when showCompareToggle is true", () => {
    renderCard(<EquipmentCard equipment={baseRubber} showCompareToggle />);
    expect(screen.getByTestId("comparison-toggle")).toBeInTheDocument();
  });

  it("clicking the toggle adds the item to the comparison context", async () => {
    const user = userEvent.setup();
    renderCard(
      <>
        <EquipmentCard equipment={baseRubber} showCompareToggle />
        <EquipmentCard
          equipment={{ ...baseRubber, id: "eq-2", slug: "rakza-7" }}
          showCompareToggle
        />
      </>
    );

    const firstCard = screen
      .getAllByTestId("equipment-card")
      .find(c => c.getAttribute("data-slug") === baseRubber.slug)!;
    const toggle = within(firstCard).getByTestId("comparison-toggle");

    expect(toggle).toHaveAttribute("data-selected", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-selected", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-selected", "false");
  });
});

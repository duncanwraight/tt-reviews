// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RatingCategories } from "../RatingCategories";

describe("RatingCategories", () => {
  const baseCategories = [
    { name: "speed", label: "Speed" },
    { name: "spin", label: "Spin" },
    { name: "control", label: "Control" },
  ];

  const baseProps = {
    name: "category_ratings",
    label: "Rating Categories",
    categories: baseCategories,
    values: {},
    min: 0,
    max: 10,
    onChange: vi.fn(),
  };

  it("renders one slider per category with that category's label", () => {
    render(<RatingCategories {...baseProps} />);
    expect(
      screen.getByRole("heading", { name: /Rating Categories/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Speed/ })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Spin/ })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Control/ })).toBeInTheDocument();
  });

  // Regression test for todo/BUGS.md: "All Rating Sliders Move Together".
  // The bug was that when a category lacked a `.name`, every slider keyed
  // off `undefined` and rendering one slider moved the rest. Moving the
  // Speed slider here must only update the Speed value — Spin/Control must
  // stay at their defaults.
  it("updates only the changed category in the onChange payload", () => {
    const onChange = vi.fn();
    render(<RatingCategories {...baseProps} onChange={onChange} />);

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(3);

    // Fire a change on the first (Speed) slider to value 7.
    fireEvent.change(sliders[0], { target: { value: "7" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("category_ratings", {
      speed: 7,
      spin: 0,
      control: 0,
    });
  });

  it("preserves existing values for categories that weren't touched", () => {
    const onChange = vi.fn();
    render(
      <RatingCategories
        {...baseProps}
        onChange={onChange}
        values={{ speed: 3, spin: 8, control: 6 }}
      />
    );

    const sliders = screen.getAllByRole("slider");
    // Move the Spin slider (index 1) to 9
    fireEvent.change(sliders[1], { target: { value: "9" } });

    expect(onChange).toHaveBeenCalledWith("category_ratings", {
      speed: 3,
      spin: 9,
      control: 6,
    });
  });

  it("renders custom min_label and max_label when provided", () => {
    render(
      <RatingCategories
        {...baseProps}
        categories={[
          {
            name: "speed",
            label: "Speed",
            min_label: "Slow",
            max_label: "Fast",
          },
        ]}
      />
    );
    expect(screen.getByText("Slow")).toBeInTheDocument();
    expect(screen.getByText("Fast")).toBeInTheDocument();
  });

  it("falls back to numeric min/max when labels are not provided", () => {
    const { container } = render(<RatingCategories {...baseProps} />);
    // Each category renders two span labels containing the numeric bounds.
    // Use textContent to avoid colliding with the value display.
    expect(container.textContent).toContain("0");
    expect(container.textContent).toContain("10");
  });

  it("shows the fallback warning when categories is empty", () => {
    render(<RatingCategories {...baseProps} categories={[]} />);
    expect(
      screen.getByText(/Rating categories not available/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});

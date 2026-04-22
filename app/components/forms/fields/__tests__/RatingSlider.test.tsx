// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RatingSlider } from "../RatingSlider";

describe("RatingSlider", () => {
  const baseProps = {
    name: "speed",
    label: "Speed",
    value: 5,
    min: 0,
    max: 10,
    onChange: vi.fn(),
  };

  it("renders the label and current value/max", () => {
    render(<RatingSlider {...baseProps} />);
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText(/5\/10/)).toBeInTheDocument();
  });

  it("fires onChange with the field name and parsed numeric value", () => {
    const onChange = vi.fn();
    render(<RatingSlider {...baseProps} onChange={onChange} />);

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "7" } });

    expect(onChange).toHaveBeenCalledWith("speed", 7);
  });

  it("disables the input when disabled", () => {
    render(<RatingSlider {...baseProps} disabled />);
    const slider = screen.getByRole("slider");
    expect(slider).toBeDisabled();
  });

  it("marks the label as required when required is true", () => {
    render(<RatingSlider {...baseProps} required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows 'No rating' when value is 0", () => {
    render(<RatingSlider {...baseProps} value={0} />);
    expect(screen.getByText(/No rating/)).toBeInTheDocument();
  });
});

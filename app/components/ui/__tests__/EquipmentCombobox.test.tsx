// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EquipmentCombobox } from "../EquipmentCombobox";

const options = [
  { id: "1", name: "Viscaria", manufacturer: "Butterfly" },
  { id: "2", name: "Tenergy 05", manufacturer: "Butterfly" },
  { id: "3", name: "Rakza 7", manufacturer: "Yasaka" },
  { id: "4", name: "Hurricane 3", manufacturer: "DHS" },
];

describe("EquipmentCombobox", () => {
  it("renders the search input with the placeholder", () => {
    render(
      <EquipmentCombobox
        name="equipment"
        options={options}
        placeholder="Pick one"
      />
    );
    expect(screen.getByPlaceholderText("Pick one")).toBeInTheDocument();
  });

  it("filters options by name match", async () => {
    const user = userEvent.setup();
    render(<EquipmentCombobox name="equipment" options={options} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.type(input, "tenergy");

    expect(screen.getByText("Tenergy 05")).toBeInTheDocument();
    expect(screen.queryByText("Viscaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Rakza 7")).not.toBeInTheDocument();
  });

  it("filters options by manufacturer match", async () => {
    const user = userEvent.setup();
    render(<EquipmentCombobox name="equipment" options={options} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.type(input, "butterfly");

    expect(screen.getByText("Viscaria")).toBeInTheDocument();
    expect(screen.getByText("Tenergy 05")).toBeInTheDocument();
    expect(screen.queryByText("Rakza 7")).not.toBeInTheDocument();
  });

  it("shows 'No equipment found' when nothing matches", async () => {
    const user = userEvent.setup();
    render(<EquipmentCombobox name="equipment" options={options} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.type(input, "nothingmatches");

    expect(screen.getByText("No equipment found")).toBeInTheDocument();
  });

  it("Enter selects the highlighted option and calls onChange with (id, name)", () => {
    const onChange = vi.fn();
    render(
      <EquipmentCombobox
        name="equipment"
        options={options}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    // Highlighted index defaults to 0 → first option is Viscaria.
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("1", "Viscaria");
  });

  it("ArrowDown moves the highlight to the next option before Enter selects", () => {
    const onChange = vi.fn();
    render(
      <EquipmentCombobox
        name="equipment"
        options={options}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("2", "Tenergy 05");
  });

  it("Escape closes the dropdown without calling onChange", () => {
    const onChange = vi.fn();
    render(
      <EquipmentCombobox
        name="equipment"
        options={options}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    // Dropdown now open — options visible.
    expect(screen.getByText("Viscaria")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Viscaria")).not.toBeInTheDocument();
  });

  it("clicking an option calls onChange and collapses the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <EquipmentCombobox
        name="equipment"
        options={options}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.click(screen.getByText("Rakza 7"));

    expect(onChange).toHaveBeenCalledWith("3", "Rakza 7");
  });

  it("shows the selected option's name when a value is passed", () => {
    render(<EquipmentCombobox name="equipment" options={options} value="4" />);
    expect(screen.getByText("Hurricane 3")).toBeInTheDocument();
    expect(screen.getByText(/DHS/)).toBeInTheDocument();
  });
});

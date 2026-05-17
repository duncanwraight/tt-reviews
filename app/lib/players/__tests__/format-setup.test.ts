import { describe, expect, it } from "vitest";

import { formatCurrentSetup } from "../format-setup";

describe("formatCurrentSetup (TT-242)", () => {
  it("formats a full setup as 'blade / FH / BH'", () => {
    expect(
      formatCurrentSetup({
        blade: { name: "Viscaria", manufacturer: "Butterfly" },
        forehandRubber: { name: "Dignics 09C", manufacturer: "Butterfly" },
        backhandRubber: { name: "Tenergy 05", manufacturer: "Butterfly" },
      })
    ).toBe("Butterfly Viscaria / Butterfly Dignics 09C / Butterfly Tenergy 05");
  });

  it("omits a missing rubber segment cleanly (no 'undefined')", () => {
    expect(
      formatCurrentSetup({
        blade: { name: "Viscaria", manufacturer: "Butterfly" },
        forehandRubber: { name: "Tenergy 05", manufacturer: "Butterfly" },
        // backhand missing entirely
      })
    ).toBe("Butterfly Viscaria / Butterfly Tenergy 05");
  });

  it("renders just the blade if both rubbers are missing", () => {
    expect(
      formatCurrentSetup({
        blade: { name: "Viscaria", manufacturer: "Butterfly" },
      })
    ).toBe("Butterfly Viscaria");
  });

  it("returns null when the setup has no pieces at all", () => {
    expect(formatCurrentSetup({})).toBeNull();
  });

  it("returns null for null / undefined input", () => {
    expect(formatCurrentSetup(null)).toBeNull();
    expect(formatCurrentSetup(undefined)).toBeNull();
  });

  it("avoids double-prefixing when the name already starts with the manufacturer (pre-TT-163 rows)", () => {
    expect(
      formatCurrentSetup({
        blade: { name: "Viscaria", manufacturer: "Butterfly" },
        forehandRubber: {
          name: "Butterfly Tenergy 05",
          manufacturer: "Butterfly",
        },
      })
    ).toBe("Butterfly Viscaria / Butterfly Tenergy 05");
  });
});

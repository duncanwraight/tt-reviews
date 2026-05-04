import { describe, expect, it } from "vitest";

import { displayEquipmentName, stripManufacturerPrefix } from "../equipment";

describe("displayEquipmentName", () => {
  it("joins manufacturer and bare model name", () => {
    expect(
      displayEquipmentName({ manufacturer: "Butterfly", name: "Sriver FX" })
    ).toBe("Butterfly Sriver FX");
  });

  it("handles multi-word manufacturers", () => {
    expect(
      displayEquipmentName({
        manufacturer: "Yinhe (Galaxy/Milkyway)",
        name: "T-11+",
      })
    ).toBe("Yinhe (Galaxy/Milkyway) T-11+");
    expect(
      displayEquipmentName({
        manufacturer: "Sauer & Troger",
        name: "Monkey",
      })
    ).toBe("Sauer & Troger Monkey");
  });
});

describe("stripManufacturerPrefix", () => {
  it("strips a leading manufacturer + space", () => {
    expect(stripManufacturerPrefix("Butterfly Sriver FX", "Butterfly")).toBe(
      "Sriver FX"
    );
  });

  it("is case-insensitive on the prefix", () => {
    expect(stripManufacturerPrefix("BUTTERFLY Sriver FX", "Butterfly")).toBe(
      "Sriver FX"
    );
  });

  it("returns the name unchanged when not prefixed", () => {
    expect(stripManufacturerPrefix("Sriver FX", "Butterfly")).toBe("Sriver FX");
    expect(stripManufacturerPrefix("Acoustic", "Stiga")).toBe("Acoustic");
  });

  it("handles multi-word and special-character manufacturers", () => {
    expect(
      stripManufacturerPrefix(
        "Yinhe (Galaxy/Milkyway) T-11+",
        "Yinhe (Galaxy/Milkyway)"
      )
    ).toBe("T-11+");
    expect(
      stripManufacturerPrefix("Sauer & Troger Monkey", "Sauer & Troger")
    ).toBe("Monkey");
    expect(
      stripManufacturerPrefix("Friendship/729 802-40", "Friendship/729")
    ).toBe("802-40");
  });

  it("is idempotent", () => {
    const stripped = stripManufacturerPrefix(
      "Butterfly Sriver FX",
      "Butterfly"
    );
    expect(stripManufacturerPrefix(stripped, "Butterfly")).toBe(stripped);
  });

  it("returns the name unchanged when manufacturer is empty", () => {
    expect(stripManufacturerPrefix("Anything", "")).toBe("Anything");
  });
});

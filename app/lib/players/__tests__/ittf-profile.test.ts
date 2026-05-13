import { describe, expect, it } from "vitest";

import { parseIttfProfile } from "../ittf-profile.server";
import { derivePlayingStyle } from "../types";

const PROFILE_TEMPLATE = (
  hand: string,
  style: string,
  grip: string,
  birthYear: string
): string => `
<td>
  <img src='flag.png'><br/><span class='notranslate'>CHINA</span><br/>
  Gender: <span class='notranslate'>Male</span><br/>
  Birth Year: <span class='notranslate'>${birthYear}</span><br/>
  Age: 26<br/>
  Style: <span class='notranslate'>${hand}</span> <span class='notranslate'>${style}</span> (<span class='notranslate'>${grip}</span>)<br/>
  Ranking: <span class='notranslate'>1</span>
</td>
`;

describe("parseIttfProfile", () => {
  it("parses a left-handed shakehand attacker", () => {
    const html = PROFILE_TEMPLATE("Left-Hand", "Attack", "ShakeHand", "2000");
    expect(parseIttfProfile(html)).toEqual({
      handedness: "left",
      style: "attack",
      grip: "shakehand",
      birth_year: 2000,
    });
  });

  it("parses a right-handed shakehand attacker", () => {
    const html = PROFILE_TEMPLATE("Right-Hand", "Attack", "ShakeHand", "1995");
    expect(parseIttfProfile(html)).toEqual({
      handedness: "right",
      style: "attack",
      grip: "shakehand",
      birth_year: 1995,
    });
  });

  it("parses a penholder", () => {
    const html = PROFILE_TEMPLATE("Right-Hand", "Attack", "Penholder", "1988");
    expect(parseIttfProfile(html)).toEqual({
      handedness: "right",
      style: "attack",
      grip: "penhold",
      birth_year: 1988,
    });
  });

  it("parses a shakehand defender", () => {
    const html = PROFILE_TEMPLATE("Right-Hand", "Defence", "ShakeHand", "1990");
    expect(parseIttfProfile(html)).toEqual({
      handedness: "right",
      style: "defence",
      grip: "shakehand",
      birth_year: 1990,
    });
  });

  it("flags surprising style tokens as 'other' so the importer leaves playing_style NULL", () => {
    const html = PROFILE_TEMPLATE(
      "Right-Hand",
      "AllRound",
      "ShakeHand",
      "1985"
    );
    expect(parseIttfProfile(html)).toEqual({
      handedness: "right",
      style: "other",
      grip: "shakehand",
      birth_year: 1985,
    });
  });

  it("returns nulls for the Unknown fallback ITTF emits for incomplete profiles", () => {
    const html = PROFILE_TEMPLATE(
      "Unknown Handness",
      "Unknown Style",
      "Unknown Grip",
      "1973"
    );
    expect(parseIttfProfile(html)).toEqual({
      handedness: null,
      style: null,
      grip: null,
      birth_year: 1973,
    });
  });

  it("returns nulls for handedness + grip when the Style block is missing entirely", () => {
    const html = `
      <td>
        Birth Year: <span class='notranslate'>2001</span><br/>
        Ranking: <span class='notranslate'>50</span>
      </td>
    `;
    expect(parseIttfProfile(html)).toEqual({
      handedness: null,
      style: null,
      grip: null,
      birth_year: 2001,
    });
  });

  it("rejects birth years outside a sane bound (treats them as null)", () => {
    const tooOld = PROFILE_TEMPLATE("Left-Hand", "Attack", "ShakeHand", "1850");
    expect(parseIttfProfile(tooOld).birth_year).toBeNull();

    const future = PROFILE_TEMPLATE("Left-Hand", "Attack", "ShakeHand", "2999");
    expect(parseIttfProfile(future).birth_year).toBeNull();
  });

  it("accepts double-quoted notranslate spans as well as single-quoted", () => {
    const html = `
      Birth Year: <span class="notranslate">1990</span><br/>
      Style: <span class="notranslate">Right-Hand</span> <span class="notranslate">Defence</span> (<span class="notranslate">ShakeHand</span>)
    `;
    expect(parseIttfProfile(html)).toEqual({
      handedness: "right",
      style: "defence",
      grip: "shakehand",
      birth_year: 1990,
    });
  });

  it("returns all nulls when the page has neither marker", () => {
    expect(
      parseIttfProfile("<html><body>nothing useful</body></html>")
    ).toEqual({
      handedness: null,
      style: null,
      grip: null,
      birth_year: null,
    });
  });
});

describe("derivePlayingStyle", () => {
  it("maps (shakehand, attack) → shakehand_attacker", () => {
    expect(derivePlayingStyle("shakehand", "attack")).toBe(
      "shakehand_attacker"
    );
  });

  it("maps (penhold, attack) → penhold_rpb", () => {
    expect(derivePlayingStyle("penhold", "attack")).toBe("penhold_rpb");
  });

  it("maps (shakehand, defence) → classical_defender", () => {
    expect(derivePlayingStyle("shakehand", "defence")).toBe(
      "classical_defender"
    );
  });

  it("returns undefined for (penhold, defence) — rare, leave to admin", () => {
    expect(derivePlayingStyle("penhold", "defence")).toBeUndefined();
  });

  it("returns undefined for any 'other' style", () => {
    expect(derivePlayingStyle("shakehand", "other")).toBeUndefined();
    expect(derivePlayingStyle("penhold", "other")).toBeUndefined();
  });

  it("returns undefined when grip or style is missing", () => {
    expect(derivePlayingStyle(undefined, "attack")).toBeUndefined();
    expect(derivePlayingStyle("shakehand", undefined)).toBeUndefined();
    expect(derivePlayingStyle(undefined, undefined)).toBeUndefined();
  });
});

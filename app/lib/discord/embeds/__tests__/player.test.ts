import { describe, expect, it } from "vitest";
import { renderPlayerEmbed } from "../player";
import type { PlayerEmbedInput, PlayerEmbedVideoInput } from "../types";

const SITE = "https://tabletennis.reviews";

function baseInput(over: Partial<PlayerEmbedInput> = {}): PlayerEmbedInput {
  return {
    name: "Ma Long",
    slug: "ma-long",
    siteUrl: SITE,
    active: false,
    represents: "CHN",
    flagEmoji: "🇨🇳",
    activeYears: "2003-2024",
    playerKind: "professional",
    peakWorldRank: 1,
    peakRankYear: 2017,
    playingStyleLabel: "Shakehand attacker",
    ...over,
  };
}

describe("renderPlayerEmbed — header + profile (description)", () => {
  it("populates title, link, author, profile-as-description for a fully-specified row", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        imageKey: "players/ma-long.webp",
        imageEtag: "abc123",
      })
    );

    expect(embed.title).toBe("Ma Long");
    expect(embed.url).toBe(`${SITE}/players/ma-long`);
    expect(embed.author?.name).toBe("🇨🇳 CHN");
    expect(embed.thumbnail?.url).toMatch(
      /\/cdn-cgi\/image\/.+\/api\/images\/players\/ma-long\.webp/
    );
    expect(embed.footer?.text).toBe("tabletennis.reviews/players/ma-long");

    // Profile lines render as the embed `description`, not as a labelled
    // field — there's no "Profile" heading anywhere in the output.
    expect(embed.description).toContain("**Style:** Shakehand attacker");
    expect(embed.description).toContain("**Retired:** 2003-2024");
    expect(embed.description).toContain("**Best rank:** WR1 (2017)");
    expect(embed.fields?.find(f => f.name === "Profile")).toBeUndefined();
  });

  it("uses 'Active' label for active players, 'Retired' for inactive", () => {
    const active = renderPlayerEmbed(
      baseInput({ active: true, activeYears: "2017-present" })
    );
    expect(active.description).toContain("**Active:** 2017-present");

    const retired = renderPlayerEmbed(baseInput({ active: false }));
    expect(retired.description).toContain("**Retired:** 2003-2024");
  });

  it("falls back to Status: Active/Retired when active_years is missing", () => {
    const embed = renderPlayerEmbed(
      baseInput({ activeYears: null, active: true })
    );
    expect(embed.description).toContain("**Status:** Active");
    expect(embed.description).not.toContain("**Active:**");
  });

  it("renders author with just country code if flag emoji is missing", () => {
    const embed = renderPlayerEmbed(
      baseInput({ flagEmoji: null, represents: "CHN" })
    );
    expect(embed.author?.name).toBe("CHN");
  });

  it("omits author entirely when represents and flagEmoji are both missing", () => {
    const embed = renderPlayerEmbed(
      baseInput({ flagEmoji: null, represents: null })
    );
    expect(embed.author).toBeUndefined();
  });

  it("omits thumbnail when image_key is null", () => {
    const embed = renderPlayerEmbed(baseInput({ imageKey: null }));
    expect(embed.thumbnail).toBeUndefined();
  });

  it("renders amateur title with '(Amateur)' suffix + Peak rating line", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        name: "Florian Bluhm",
        slug: "florian-bluhm",
        active: true,
        activeYears: "2010-present",
        represents: "GER",
        flagEmoji: "🇩🇪",
        playerKind: "amateur",
        peakWorldRank: null,
        peakRankYear: null,
        peakRatingValue: 2350,
        peakRatingYear: 2023,
        ratingCountry: "GER",
      })
    );
    expect(embed.title).toBe("Florian Bluhm (Amateur)");
    expect(embed.description).toContain("**Peak rating:** 2350 TTR (2023)");
    expect(embed.description).not.toContain("Best rank");
  });
});

describe("renderPlayerEmbed — Current setup field", () => {
  it("renders a full setup as 3 emoji-prefixed lines + italic 'Since YYYY'", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: { name: "Viscaria", manufacturer: "Butterfly" },
          forehandRubber: {
            name: "Hurricane 3 NEO",
            manufacturer: "DHS",
            color: "black",
          },
          backhandRubber: {
            name: "Tenergy 05",
            manufacturer: "Butterfly",
            color: "red",
          },
          year: 2024,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup).toBeDefined();
    const lines = setup!.value.split("\n");
    expect(lines[0]).toBe("🏓 (blade) Butterfly Viscaria");
    expect(lines[1]).toBe("⚫ (FH) DHS Hurricane 3 NEO");
    expect(lines[2]).toBe("🔴 (BH) Butterfly Tenergy 05");
    expect(lines[3]).toBe("*Since 2024*");
  });

  it("avoids double-prefixing when the rubber name already starts with the manufacturer", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: { name: "Viscaria", manufacturer: "Butterfly" },
          forehandRubber: {
            // Pre-TT-163 catalogue rows often had the brand baked into
            // the name (e.g. "Butterfly Tenergy 05"). Don't render
            // "Butterfly Butterfly Tenergy 05".
            name: "Butterfly Tenergy 05",
            manufacturer: "Butterfly",
            color: "red",
          },
          backhandRubber: null,
          year: null,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toContain("🏓 (blade) Butterfly Viscaria");
    expect(setup?.value).toContain("🔴 (FH) Butterfly Tenergy 05");
    expect(setup?.value).not.toContain("Butterfly Butterfly");
  });

  it("uses a • fallback when rubber color is null/unknown", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: null,
          forehandRubber: {
            name: "Mark V",
            manufacturer: "Yasaka",
            color: null,
          },
          backhandRubber: null,
          year: null,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toContain("• (FH) Yasaka Mark V");
  });

  it("omits 'Since YYYY' line when year is missing but renders the rest", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: { name: "Viscaria", manufacturer: "Butterfly" },
          forehandRubber: null,
          backhandRubber: null,
          year: null,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toBe("🏓 (blade) Butterfly Viscaria");
    expect(setup?.value).not.toContain("Since");
  });

  it("omits the Current setup field entirely when blade + both rubbers are absent", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: null,
          forehandRubber: null,
          backhandRubber: null,
          year: 2024,
        },
      })
    );
    expect(embed.fields?.find(f => f.name === "Current setup")).toBeUndefined();
  });

  it("omits the Current setup field when no setup is supplied at all", () => {
    const embed = renderPlayerEmbed(baseInput({ setup: null }));
    expect(embed.fields?.find(f => f.name === "Current setup")).toBeUndefined();
  });

  it("renders a partial setup (blade only) without falsy emoji rows", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          blade: { name: "Viscaria", manufacturer: "Butterfly" },
          forehandRubber: null,
          backhandRubber: null,
          year: 2024,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toBe("🏓 (blade) Butterfly Viscaria\n*Since 2024*");
  });
});

describe("renderPlayerEmbed — Videos field", () => {
  it("renders a single video as a bare link (no bullet)", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        videos: [
          { title: "Ma Long highlights 2024", url: "https://example.com/1" },
        ],
      })
    );
    const videos = embed.fields?.find(f => f.name === "Videos");
    expect(videos?.value).toBe(
      "[Ma Long highlights 2024](https://example.com/1)"
    );
    expect(videos?.value).not.toMatch(/^- /);
  });

  it("bullet-prefixes each line when more than one video is supplied", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        videos: [
          { title: "First", url: "https://example.com/1" },
          { title: "Second", url: "https://example.com/2" },
        ],
      })
    );
    const videos = embed.fields?.find(f => f.name === "Videos");
    const lines = videos!.value.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("- [First](https://example.com/1)");
    expect(lines[1]).toBe("- [Second](https://example.com/2)");
  });

  it("caps videos at 3 (with bullet markers)", () => {
    const five: PlayerEmbedVideoInput[] = Array.from({ length: 5 }, (_, i) => ({
      title: `Video ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    }));
    const embed = renderPlayerEmbed(baseInput({ videos: five }));
    const videos = embed.fields?.find(f => f.name === "Videos");
    const lines = videos!.value.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("- ")).toBe(true);
    expect(lines[2]).toContain("Video 3");
  });

  it("truncates video titles longer than 80 chars with ellipsis", () => {
    const longTitle = "x".repeat(100);
    const embed = renderPlayerEmbed(
      baseInput({
        videos: [{ title: longTitle, url: "https://example.com/x" }],
      })
    );
    const videos = embed.fields?.find(f => f.name === "Videos");
    expect(videos?.value).toMatch(/…\]\(https:\/\/example\.com\/x\)$/);
    const inside = videos!.value.match(/\[(.+?)\]/)![1];
    expect(inside.length).toBeLessThanOrEqual(80);
  });

  it("omits the Videos field when none are supplied", () => {
    const embed = renderPlayerEmbed(baseInput({ videos: [] }));
    expect(embed.fields?.find(f => f.name === "Videos")).toBeUndefined();
  });
});

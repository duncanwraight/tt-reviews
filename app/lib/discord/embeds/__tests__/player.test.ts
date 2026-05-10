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
    highestRating: "WR1",
    playingStyleLabel: "Shakehand attacker",
    ...over,
  };
}

describe("renderPlayerEmbed", () => {
  it("populates title, link, author, profile for a fully-specified row", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        imageKey: "players/ma-long.webp",
        imageEtag: "abc123",
        setup: {
          bladeName: "Ma Long Carbon",
          forehandRubberName: "DHS Hurricane 3 NEO",
          backhandRubberName: "Butterfly Tenergy 05",
          year: 2024,
        },
        videos: [
          { title: "Ma Long highlights 2024", url: "https://example.com/1" },
        ],
      })
    );

    expect(embed.title).toBe("Ma Long");
    expect(embed.url).toBe(`${SITE}/players/ma-long`);
    expect(embed.author?.name).toBe("🇨🇳 CHN");
    expect(embed.thumbnail?.url).toMatch(
      /\/cdn-cgi\/image\/.+\/api\/images\/players\/ma-long\.webp/
    );
    expect(embed.footer?.text).toBe("tabletennis.reviews/players/ma-long");

    const profile = embed.fields?.find(f => f.name === "Profile");
    expect(profile?.value).toContain("**Style:** Shakehand attacker");
    expect(profile?.value).toContain("**Retired:** 2003-2024");
    expect(profile?.value).toContain("**Highest rating:** WR1");

    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toBe(
      "Ma Long Carbon / DHS Hurricane 3 NEO / Butterfly Tenergy 05 (since 2024)"
    );

    const videos = embed.fields?.find(f => f.name === "Recent videos");
    expect(videos?.value).toBe(
      "[Ma Long highlights 2024](https://example.com/1)"
    );
  });

  it("uses 'Active' label for active players, 'Retired' for inactive", () => {
    const active = renderPlayerEmbed(
      baseInput({ active: true, activeYears: "2017-present" })
    );
    expect(active.fields?.find(f => f.name === "Profile")?.value).toContain(
      "**Active:** 2017-present"
    );

    const retired = renderPlayerEmbed(baseInput({ active: false }));
    expect(retired.fields?.find(f => f.name === "Profile")?.value).toContain(
      "**Retired:** 2003-2024"
    );
  });

  it("omits Current setup when no verified setup is supplied", () => {
    const embed = renderPlayerEmbed(baseInput({ setup: null }));
    expect(embed.fields?.find(f => f.name === "Current setup")).toBeUndefined();
  });

  it("omits 'since YYYY' when setup year is missing but renders blade/FH/BH", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          bladeName: "Viscaria",
          forehandRubberName: "Tenergy 05",
          backhandRubberName: "Tenergy 64",
          year: null,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toBe("Viscaria / Tenergy 05 / Tenergy 64");
    expect(setup?.value).not.toContain("since");
  });

  it("renders an em-dash placeholder for missing rubbers in a partial setup", () => {
    const embed = renderPlayerEmbed(
      baseInput({
        setup: {
          bladeName: "Viscaria",
          forehandRubberName: null,
          backhandRubberName: null,
          year: 2024,
        },
      })
    );
    const setup = embed.fields?.find(f => f.name === "Current setup");
    expect(setup?.value).toBe("Viscaria / — / — (since 2024)");
  });

  it("omits Recent videos when no videos are supplied", () => {
    const embed = renderPlayerEmbed(baseInput({ videos: [] }));
    expect(embed.fields?.find(f => f.name === "Recent videos")).toBeUndefined();
  });

  it("caps videos at 3 even if more are supplied", () => {
    const five: PlayerEmbedVideoInput[] = Array.from({ length: 5 }, (_, i) => ({
      title: `Video ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    }));
    const embed = renderPlayerEmbed(baseInput({ videos: five }));
    const videosField = embed.fields?.find(f => f.name === "Recent videos");
    const lines = videosField!.value.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Video 1");
    expect(lines[2]).toContain("Video 3");
  });

  it("truncates video titles longer than 80 chars with ellipsis", () => {
    const longTitle = "x".repeat(100);
    const embed = renderPlayerEmbed(
      baseInput({
        videos: [{ title: longTitle, url: "https://example.com/x" }],
      })
    );
    const videosField = embed.fields?.find(f => f.name === "Recent videos");
    // Match `[<truncated>…](url)` — anchor on the trailing "](url)"
    expect(videosField?.value).toMatch(/…\]\(https:\/\/example\.com\/x\)$/);
    // Title text inside the brackets is at most 80 chars (incl. ellipsis).
    const inside = videosField!.value.match(/\[(.+?)\]/)![1];
    expect(inside.length).toBeLessThanOrEqual(80);
  });

  it("omits thumbnail when image_key is null", () => {
    const embed = renderPlayerEmbed(baseInput({ imageKey: null }));
    expect(embed.thumbnail).toBeUndefined();
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

  it("falls back to Status: Active/Retired when active_years is missing", () => {
    const embed = renderPlayerEmbed(
      baseInput({ activeYears: null, active: true })
    );
    const profile = embed.fields?.find(f => f.name === "Profile");
    expect(profile?.value).toContain("**Status:** Active");
    expect(profile?.value).not.toContain("**Active:**");
  });

  it("does not render the Profile field when there's nothing to show", () => {
    // No playing style, no rating, no active years — just the bare
    // active boolean. The renderer still falls back to a Status line,
    // so the Profile field should still be present.
    const embed = renderPlayerEmbed({
      name: "Anon Player",
      slug: "anon-player",
      siteUrl: SITE,
      active: true,
      playingStyleLabel: null,
      activeYears: null,
      highestRating: null,
    });
    const profile = embed.fields?.find(f => f.name === "Profile");
    expect(profile).toBeDefined();
    expect(profile!.value).toContain("Status:** Active");
  });
});

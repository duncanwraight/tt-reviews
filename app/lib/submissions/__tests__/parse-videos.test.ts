import { describe, it, expect } from "vitest";
import { parseBracketedVideos } from "../parse-videos";

describe("parseBracketedVideos", () => {
  it("returns an empty array when no videos[N][...] keys are present", () => {
    const fd = new FormData();
    fd.set("name", "anything");
    expect(parseBracketedVideos(fd)).toEqual([]);
  });

  it("parses videos[N][url|title|platform] tuples in index order", () => {
    const fd = new FormData();
    fd.set("videos[0][url]", "https://youtube.com/a");
    fd.set("videos[0][title]", "A");
    fd.set("videos[0][platform]", "youtube");
    fd.set("videos[1][url]", "https://example.com/b");
    fd.set("videos[1][title]", "B");
    fd.set("videos[1][platform]", "other");
    expect(parseBracketedVideos(fd)).toEqual([
      { url: "https://youtube.com/a", title: "A", platform: "youtube" },
      { url: "https://example.com/b", title: "B", platform: "other" },
    ]);
  });

  it("falls platform back to 'other' when missing or unrecognised", () => {
    const fd = new FormData();
    fd.set("videos[0][url]", "https://x");
    fd.set("videos[0][title]", "X");
    fd.set("videos[0][platform]", "vimeo");
    fd.set("videos[1][url]", "https://y");
    fd.set("videos[1][title]", "Y");
    // platform omitted entirely
    const parsed = parseBracketedVideos(fd);
    expect(parsed[0].platform).toBe("other");
    expect(parsed[1].platform).toBe("other");
  });

  it("drops entries with blank url or title", () => {
    const fd = new FormData();
    fd.set("videos[0][url]", "   ");
    fd.set("videos[0][title]", "Has title but no URL");
    fd.set("videos[1][url]", "https://x");
    fd.set("videos[1][title]", "");
    fd.set("videos[2][url]", "https://valid");
    fd.set("videos[2][title]", "Valid");
    fd.set("videos[2][platform]", "youtube");
    expect(parseBracketedVideos(fd)).toEqual([
      { url: "https://valid", title: "Valid", platform: "youtube" },
    ]);
  });

  it("preserves index order even when keys arrive out of order", () => {
    const fd = new FormData();
    fd.set("videos[2][url]", "https://c");
    fd.set("videos[2][title]", "C");
    fd.set("videos[0][url]", "https://a");
    fd.set("videos[0][title]", "A");
    fd.set("videos[1][url]", "https://b");
    fd.set("videos[1][title]", "B");
    expect(parseBracketedVideos(fd).map(v => v.title)).toEqual(["A", "B", "C"]);
  });
});

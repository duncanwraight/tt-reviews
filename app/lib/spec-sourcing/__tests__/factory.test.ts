import { describe, expect, it } from "vitest";

import { buildSpecSourcingFromEnv } from "../factory";

describe("buildSpecSourcingFromEnv", () => {
  it("returns a deterministic stub set when TEST_SPEC_SOURCING=true", async () => {
    const { sources, extractor } = buildSpecSourcingFromEnv({
      TEST_SPEC_SOURCING: "true",
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe("test-stub");
    expect(extractor.id).toBe("test-stub-extractor");

    const candidates = await sources[0].search({
      brand: "Butterfly",
      name: "Viscaria",
      slug: "butterfly-viscaria",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toContain("butterfly-viscaria");

    const extracted = await extractor.extract("<html></html>", {
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(extracted.status).toBe("ok");
    expect(extracted.result?.specs.weight).toBe(89);
  });

  it("returns the real source registry + Gemini extractor when TEST flag is unset", () => {
    const { sources, extractor } = buildSpecSourcingFromEnv({
      GEMINI_API_KEY: "stub-key",
    });

    expect(sources.map(s => s.id)).toContain("butterfly");
    expect(sources.map(s => s.id)).toContain("tt11");
    expect(sources.map(s => s.id)).toContain("revspin");
    expect(extractor.id).toBe("gemini-2.5-flash");
  });

  it("falls back to a default daily cap when GEMINI_DAILY_CAP is unset", () => {
    // Build a fake KV that records reads — proves the cap is wired.
    const reads: string[] = [];
    const kv = {
      async get(key: string) {
        reads.push(key);
        return null;
      },
      async put() {
        return undefined;
      },
    };

    const { extractor } = buildSpecSourcingFromEnv({
      GEMINI_API_KEY: "stub",
      PROVIDER_QUOTA: kv,
    });

    expect(extractor.id).toBe("gemini-2.5-flash");
  });
});

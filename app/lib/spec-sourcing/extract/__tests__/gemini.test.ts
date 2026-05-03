import { describe, expect, it, vi } from "vitest";

import { makeGeminiExtractor } from "../gemini";

const VISCARIA_HTML = `<html><body>
<h1>Viscaria</h1>
<table>
  <tr><th>Plies</th><td>5+2 (Arylate Carbon)</td></tr>
  <tr><th>Weight</th><td>89g</td></tr>
  <tr><th>Speed</th><td>9.5</td></tr>
</table>
<p>Legendary all-round blade with arylate-carbon outer plies.</p>
</body></html>`;

const VISCARIA_REF = {
  brand: "Butterfly",
  name: "Viscaria",
  category: "blade" as const,
};

function geminiResponse(jsonText: string, totalTokens = 1234): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: jsonText }] } }],
      usageMetadata: { totalTokenCount: totalTokens },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("makeGeminiExtractor.extract", () => {
  it("parses a well-formed Gemini response into an ExtractedSpec", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse(
        JSON.stringify({
          specs: {
            weight: 89,
            plies_wood: 5,
            plies_composite: 2,
            composite_material: "Arylate Carbon",
            speed: 9.5,
          },
          description: "Legendary all-round blade.",
          uncertain_fields: ["speed"],
        })
      )
    ) as unknown as typeof fetch;

    const extractor = makeGeminiExtractor({ apiKey: "test", fetchImpl });
    const result = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);

    expect(result).not.toBeNull();
    expect(result!.specs).toMatchObject({
      weight: 89,
      plies_wood: 5,
      plies_composite: 2,
      composite_material: "Arylate Carbon",
      speed: 9.5,
    });
    expect(result!.description).toBe("Legendary all-round blade.");
    expect(result!.perFieldConfidence).toEqual({ speed: 0.5 });
    expect(result!.rawHtmlExcerpt.length).toBeGreaterThan(0);
  });

  it("calls the gemini.com REST endpoint with the api key in the query string", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ specs: {} }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({
      apiKey: "abc-123",
      fetchImpl,
    });
    await extractor.extract(VISCARIA_HTML, VISCARIA_REF);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(url).toMatch(
      /generativelanguage\.googleapis\.com.*gemini-2\.5-flash:generateContent\?key=abc-123$/
    );
  });

  it("returns null when Gemini returns a non-OK status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("rate limited", { status: 429 })
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    expect(await extractor.extract(VISCARIA_HTML, VISCARIA_REF)).toBeNull();
  });

  it("returns null when candidate text is malformed JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse("this is not JSON at all")
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    expect(await extractor.extract(VISCARIA_HTML, VISCARIA_REF)).toBeNull();
  });

  it("returns null when the response has no specs object", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ description: "no specs object" }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    expect(await extractor.extract(VISCARIA_HTML, VISCARIA_REF)).toBeNull();
  });

  it("drops invalid spec values rather than failing the whole extraction", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse(
        JSON.stringify({
          specs: {
            weight: 89,
            // invalid hardness shape — should be dropped
            hardness: "wrong-shape",
            // invalid speed type — should be dropped
            speed: "fast",
            plies_wood: 5,
          },
        })
      )
    ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const result = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(result).not.toBeNull();
    expect(result!.specs).toEqual({ weight: 89, plies_wood: 5 });
  });

  it("accepts a hardness range with min/max", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse(
        JSON.stringify({
          specs: { hardness: { min: 40, max: 42 } },
        })
      )
    ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const result = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(result!.specs).toEqual({ hardness: { min: 40, max: 42 } });
  });
});

describe("makeGeminiExtractor.match", () => {
  it("parses { matches, confidence } from the response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ matches: true, confidence: 0.92 }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });

    const result = await extractor.match(
      "<html><body>Viscaria blade page</body></html>",
      VISCARIA_REF,
      {
        url: "https://en.butterfly.tt/viscaria.html",
        title: "Viscaria",
      }
    );
    expect(result).toEqual({ matches: true, confidence: 0.92 });
  });

  it("clamps confidence into [0,1]", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ matches: false, confidence: 1.7 }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const result = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(result?.confidence).toBe(1);
  });

  it("returns null when matches is missing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ confidence: 0.5 }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const result = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network failure)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const result = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(result).toBeNull();
  });
});

describe("makeGeminiExtractor.id", () => {
  it("reports the model name as the extractor id", () => {
    const extractor = makeGeminiExtractor({ apiKey: "k" });
    expect(extractor.id).toBe("gemini-2.5-flash");
  });

  it("respects an injected model name (used for swap-only changes)", () => {
    const extractor = makeGeminiExtractor({
      apiKey: "k",
      model: "gemini-2.5-pro",
    });
    expect(extractor.id).toBe("gemini-2.5-pro");
  });
});

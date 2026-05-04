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
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);

    expect(outcome.diagnostics.failureReason).toBe("ok");
    expect(outcome.diagnostics.tokens).toBe(1234);
    expect(outcome.diagnostics.httpStatus).toBe(200);
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.specs).toMatchObject({
      weight: 89,
      plies_wood: 5,
      plies_composite: 2,
      composite_material: "Arylate Carbon",
      speed: 9.5,
    });
    expect(outcome.result!.description).toBe("Legendary all-round blade.");
    expect(outcome.result!.perFieldConfidence).toEqual({ speed: 0.5 });
    expect(outcome.result!.rawHtmlExcerpt.length).toBeGreaterThan(0);
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

  it("classifies a 401/403 from Gemini as auth_failed (fatal config issue)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("API key invalid", { status: 401 })
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "bad", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("auth_failed");
    expect(outcome.diagnostics.httpStatus).toBe(401);
    expect(outcome.diagnostics.rawResponse).toBe("API key invalid");
  });

  it("classifies a 429 / 5xx from Gemini as http_non_ok with the body excerpt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("rate limited", { status: 429 })
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("http_non_ok");
    expect(outcome.diagnostics.httpStatus).toBe(429);
    expect(outcome.diagnostics.rawResponse).toBe("rate limited");
  });

  it("returns missing_api_key when constructed with an empty apiKey, without making a request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("missing_api_key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies malformed candidate JSON as parse_failed and includes the rawResponse", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse("this is not JSON at all")
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("parse_failed");
    expect(outcome.diagnostics.rawResponse).toBe("this is not JSON at all");
    expect(outcome.diagnostics.tokens).toBe(1234);
  });

  it("classifies a missing specs object as schema_invalid with a validationDetail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ description: "no specs object" }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("schema_invalid");
    expect(outcome.diagnostics.validationDetail).toContain("specs");
    expect(outcome.diagnostics.rawResponse).toContain("no specs object");
  });

  it("classifies an empty candidate text as empty_response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("empty_response");
    expect(outcome.diagnostics.httpStatus).toBe(200);
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
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.diagnostics.failureReason).toBe("ok");
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.specs).toEqual({ weight: 89, plies_wood: 5 });
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
    const outcome = await extractor.extract(VISCARIA_HTML, VISCARIA_REF);
    expect(outcome.result!.specs).toEqual({
      hardness: { min: 40, max: 42 },
    });
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

    const outcome = await extractor.match(
      "<html><body>Viscaria blade page</body></html>",
      VISCARIA_REF,
      {
        url: "https://en.butterfly.tt/viscaria.html",
        title: "Viscaria",
      }
    );
    expect(outcome.diagnostics.failureReason).toBe("ok");
    expect(outcome.result).toEqual({ matches: true, confidence: 0.92 });
  });

  it("clamps confidence into [0,1]", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ matches: false, confidence: 1.7 }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(outcome.result?.confidence).toBe(1);
  });

  it("classifies missing `matches` as schema_invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        geminiResponse(JSON.stringify({ confidence: 0.5 }))
      ) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("schema_invalid");
    expect(outcome.diagnostics.validationDetail).toContain("matches");
  });

  it("classifies a network failure as fetch_failed with the error message", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    const extractor = makeGeminiExtractor({ apiKey: "k", fetchImpl });
    const outcome = await extractor.match("<html></html>", VISCARIA_REF, {
      url: "https://x",
      title: "x",
    });
    expect(outcome.result).toBeNull();
    expect(outcome.diagnostics.failureReason).toBe("fetch_failed");
    expect(outcome.diagnostics.validationDetail).toBe("ECONNRESET");
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

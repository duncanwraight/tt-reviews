// Gemini 2.5 Flash spec extractor (TT-148). Calls Google AI Studio's
// REST endpoint directly — no SDK — to keep the Worker bundle small
// and avoid runtime polyfills. JSON mode (response_mime_type) gives
// us a strict response shape; we still validate before trusting it
// because the model occasionally adds prose around the JSON despite
// JSON mode being on.
//
// Two callable entry points:
//   - match(html, equipment, candidate) — disambiguation, ~500 in / 50 out
//   - extract(html, equipment)          — full spec pull, ~30K in / 500 out
//
// Both fail soft to null on:
//   - non-2xx HTTP from Gemini
//   - empty or malformed candidate response
//   - JSON parse failure
//   - top-level schema mismatch
//
// Per-field confidence comes from the model's `uncertain_fields` array;
// listed fields drop to 0.5, the rest default to 1.0. Sparse on purpose:
// the worker (TT-149) merges across sources and uses the highest
// confidence for each field.

import { Logger, createLogContext } from "../../logger.server";
import type { EquipmentRef, SpecCandidate } from "../sources/types";
import { cleanHtml, takeExcerpt } from "./clean-html";
import type {
  ExtractedSpec,
  MatchResult,
  SpecExtractor,
  SpecValue,
} from "./types";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Specs schema — what we ask the model to fill. Mirrors
// archive/EQUIPMENT-SPECS.md. Keep this in sync with the doc; the
// migration in TT-146 stores values as JSONB so adding fields here
// doesn't require a schema change.
const EXTRACT_SYSTEM_PROMPT = `You extract structured table-tennis equipment specifications from a product page.

Return ONLY JSON with this exact shape:
{
  "specs": {
    "weight": number | null,             // grams, integer
    "thickness": number | null,          // millimetres, e.g. 5.7
    "plies_wood": number | null,         // integer
    "plies_composite": number | null,    // integer; 0 if pure wood
    "composite_material": string | null, // e.g. "Arylate Carbon", "ZL Fiber"
    "speed": number | null,              // 0..10 manufacturer rating
    "spin": number | null,
    "control": number | null,
    "hardness": { "min": number, "max": number } | null,
    "sponge": string | null,             // sponge descriptor
    "topsheet": string | null,
    "year": string | null                // release year as a string
  },
  "description": string | null,          // ≤200-char paragraph
  "uncertain_fields": string[]           // names from specs that you guessed
}

Rules:
- Omit values you cannot read from the page — leave them null.
- Use the page's own units; convert "mm" / "g" but keep ratings on the page's published 0..10 scale.
- Description must be ≤200 chars and one paragraph.
- Do not invent specs. If a field isn't on the page, set it to null.
- Output JSON only — no markdown fence, no prose around it.`;

const MATCH_SYSTEM_PROMPT = `You decide whether a product page describes the same table-tennis equipment as a reference. Return ONLY JSON:
{ "matches": boolean, "confidence": number }
- confidence is 0..1 — your self-rated certainty.
- Treat brand variants and renames as the same product only when the page explicitly says so. Treat "Super ALC", "ZLC", "Inner" etc. modifier suffixes as DIFFERENT products.`;

interface GeminiUsageMetadata {
  totalTokenCount?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
  error?: { message?: string };
}

export interface GeminiExtractorDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
  // Test seam — the model field changes more often than the endpoint
  // path; expose it so tests can pin a specific name in the request URL.
  model?: string;
}

function buildEndpoint(apiKey: string, model: string): string {
  return `${GEMINI_ENDPOINT.replace("gemini-2.5-flash", model)}?key=${encodeURIComponent(apiKey)}`;
}

async function callGemini(
  endpoint: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<{ json: unknown; usageMetadata: GeminiUsageMetadata } | null> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    Logger.error(
      "gemini fetch failed",
      createLogContext("spec-sourcing-gemini"),
      err instanceof Error ? err : undefined
    );
    return null;
  }

  if (!res.ok) {
    Logger.warn(
      `gemini returned ${res.status}`,
      createLogContext("spec-sourcing-gemini", { status: res.status })
    );
    return null;
  }

  let parsed: GeminiResponse;
  try {
    parsed = (await res.json()) as GeminiResponse;
  } catch {
    return null;
  }

  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) return null;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  return { json, usageMetadata: parsed.usageMetadata ?? {} };
}

function isHardnessRange(v: unknown): v is { min: number; max: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { min: unknown }).min === "number" &&
    typeof (v as { max: unknown }).max === "number"
  );
}

// Field-type allowlist — mirrors archive/EQUIPMENT-SPECS.md. Keep in
// sync when new spec fields are added; unknown field names get
// passed through with permissive number-or-string validation so the
// extractor doesn't drop forward-compatible additions silently.
const NUMERIC_FIELDS = new Set([
  "weight",
  "thickness",
  "plies_wood",
  "plies_composite",
  "speed",
  "spin",
  "control",
]);
const TEXT_FIELDS = new Set([
  "composite_material",
  "material",
  "sponge",
  "topsheet",
  "year",
]);

function validateSpecValue(
  field: string,
  value: unknown
): SpecValue | undefined {
  if (value === null) return null;
  if (field === "hardness") {
    return isHardnessRange(value) ? value : undefined;
  }
  if (NUMERIC_FIELDS.has(field)) {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }
  if (TEXT_FIELDS.has(field)) {
    return typeof value === "string" ? value : undefined;
  }
  // Unknown field — accept either shape so a future spec field
  // doesn't silently disappear before this allowlist is updated.
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  return undefined;
}

function validateExtractedJson(json: unknown): ExtractedSpec | null {
  if (typeof json !== "object" || json === null) return null;
  const root = json as Record<string, unknown>;
  if (typeof root.specs !== "object" || root.specs === null) return null;

  const specsIn = root.specs as Record<string, unknown>;
  const specs: Record<string, SpecValue> = {};
  for (const [k, v] of Object.entries(specsIn)) {
    const validated = validateSpecValue(k, v);
    if (validated !== undefined) specs[k] = validated;
  }

  const description =
    typeof root.description === "string" ? root.description : null;

  const uncertain = Array.isArray(root.uncertain_fields)
    ? root.uncertain_fields.filter((x): x is string => typeof x === "string")
    : [];
  const perFieldConfidence: Record<string, number> = {};
  for (const k of uncertain) perFieldConfidence[k] = 0.5;

  return {
    specs,
    description,
    perFieldConfidence,
    rawHtmlExcerpt: "",
  };
}

function validateMatchJson(json: unknown): MatchResult | null {
  if (typeof json !== "object" || json === null) return null;
  const root = json as { matches?: unknown; confidence?: unknown };
  if (typeof root.matches !== "boolean") return null;
  if (typeof root.confidence !== "number" || !Number.isFinite(root.confidence))
    return null;
  return {
    matches: root.matches,
    confidence: Math.min(1, Math.max(0, root.confidence)),
  };
}

export function makeGeminiExtractor(deps: GeminiExtractorDeps): SpecExtractor {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = deps.model ?? "gemini-2.5-flash";
  const endpoint = buildEndpoint(deps.apiKey, model);

  return {
    id: model,
    async match(html, equipment, candidate) {
      const cleaned = cleanHtml(html, { maxChars: 4000 });
      const userText = [
        `Reference: ${equipment.brand} ${equipment.name}`.trim(),
        `Candidate URL: ${candidate.url}`,
        `Candidate title: ${candidate.title}`,
        `First section of candidate page:\n${cleaned}`,
      ].join("\n");

      const result = await callGemini(
        endpoint,
        {
          systemInstruction: { parts: [{ text: MATCH_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        },
        fetchImpl
      );
      if (!result) return null;

      if (result.usageMetadata.totalTokenCount !== undefined) {
        Logger.debug(
          `gemini.match tokens=${result.usageMetadata.totalTokenCount}`,
          createLogContext("spec-sourcing-gemini", {
            kind: "match",
            tokens: result.usageMetadata.totalTokenCount,
          })
        );
      }

      return validateMatchJson(result.json);
    },
    async extract(html, equipment) {
      const cleaned = cleanHtml(html, { maxChars: 30_000 });
      const excerpt = takeExcerpt(html, 1024);
      const userText = [
        `Equipment: ${equipment.brand} ${equipment.name}`.trim(),
        `Category: ${equipment.category ?? "unknown"}${
          equipment.subcategory ? ` (${equipment.subcategory})` : ""
        }`,
        `Page HTML (cleaned, possibly truncated):\n${cleaned}`,
      ].join("\n");

      const result = await callGemini(
        endpoint,
        {
          systemInstruction: { parts: [{ text: EXTRACT_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        },
        fetchImpl
      );
      if (!result) return null;

      if (result.usageMetadata.totalTokenCount !== undefined) {
        Logger.debug(
          `gemini.extract tokens=${result.usageMetadata.totalTokenCount}`,
          createLogContext("spec-sourcing-gemini", {
            kind: "extract",
            tokens: result.usageMetadata.totalTokenCount,
          })
        );
      }

      const validated = validateExtractedJson(result.json);
      if (!validated) return null;
      return { ...validated, rawHtmlExcerpt: excerpt };
    },
  };
}

// Gemini 2.5 Flash spec extractor (TT-148, expanded for TT-162).
// Calls Google AI Studio's REST endpoint directly — no SDK — to keep
// the Worker bundle small and avoid runtime polyfills. JSON mode
// (response_mime_type) gives us a strict response shape; we still
// validate before trusting it because the model occasionally adds
// prose around the JSON despite JSON mode being on.
//
// Two callable entry points:
//   - match(html, equipment, candidate) — disambiguation, ~500 in / 50 out
//   - extract(html, equipment)          — full spec pull, ~30K in / 500 out
//
// Per TT-162: every code path returns an Outcome with a populated
// diagnostics envelope. Failure reasons cover:
//   - missing_api_key  — extractor was constructed without one
//   - fetch_failed     — fetch() threw / network error
//   - auth_failed      — 401/403 from Gemini (config issue → alert)
//   - http_non_ok      — other non-2xx
//   - empty_response   — 200 but no candidate text
//   - parse_failed     — text was not JSON
//   - schema_invalid   — JSON shape didn't match the expected schema
//   - ok               — success
//
// Per-field confidence comes from the model's `uncertain_fields` array;
// listed fields drop to 0.5, the rest default to 1.0. Sparse on purpose:
// the worker (TT-149) merges across sources and uses the highest
// confidence for each field.

import { Logger, createLogContext } from "../../logger.server";
import type { EquipmentRef, SpecCandidate } from "../sources/types";
import { cleanHtml, takeExcerpt } from "./clean-html";
import type {
  ExtractDiagnostics,
  ExtractedSpec,
  ExtractOutcome,
  ExtractorFailureReason,
  MatchOutcome,
  MatchResult,
  SpecExtractor,
  SpecValue,
} from "./types";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const RAW_RESPONSE_LOG_CHARS = 512;

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
    "plies_composite": number | null,    // integer; null for pure-wood blades
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

interface CallResult {
  // Parsed JSON payload from the candidate text, only present on
  // failureReason="ok".
  json?: unknown;
  diagnostics: ExtractDiagnostics;
}

// Single low-level Gemini call. Returns a parsed JSON payload + a
// fully-populated diagnostics envelope on every code path. No
// silent nulls.
async function callGemini(
  endpoint: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    Logger.error(
      "gemini fetch failed",
      createLogContext("spec-sourcing-gemini"),
      err instanceof Error ? err : undefined
    );
    return {
      diagnostics: {
        failureReason: "fetch_failed",
        validationDetail: msg,
      },
    };
  }

  let bodyText: string | undefined;
  try {
    bodyText = await res.text();
  } catch {
    bodyText = undefined;
  }

  const httpStatus = res.status;

  if (!res.ok) {
    const reason: ExtractorFailureReason =
      httpStatus === 401 || httpStatus === 403 ? "auth_failed" : "http_non_ok";
    Logger.warn(
      `gemini returned ${httpStatus}`,
      createLogContext("spec-sourcing-gemini", { status: httpStatus })
    );
    return {
      diagnostics: {
        failureReason: reason,
        httpStatus,
        rawResponse: bodyText
          ? truncate(bodyText, RAW_RESPONSE_LOG_CHARS)
          : undefined,
        validationDetail: `Gemini returned HTTP ${httpStatus}`,
      },
    };
  }

  let parsed: GeminiResponse;
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as GeminiResponse) : {};
  } catch (err) {
    return {
      diagnostics: {
        failureReason: "parse_failed",
        httpStatus,
        rawResponse: bodyText
          ? truncate(bodyText, RAW_RESPONSE_LOG_CHARS)
          : undefined,
        validationDetail:
          err instanceof Error
            ? `outer envelope JSON parse: ${err.message}`
            : "outer envelope JSON parse failed",
      },
    };
  }

  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    return {
      diagnostics: {
        failureReason: "empty_response",
        httpStatus,
        tokens: parsed.usageMetadata?.totalTokenCount,
        rawResponse: bodyText
          ? truncate(bodyText, RAW_RESPONSE_LOG_CHARS)
          : undefined,
        validationDetail: "no candidate text in Gemini response",
      },
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return {
      diagnostics: {
        failureReason: "parse_failed",
        httpStatus,
        tokens: parsed.usageMetadata?.totalTokenCount,
        rawResponse: truncate(text, RAW_RESPONSE_LOG_CHARS),
        validationDetail:
          err instanceof Error
            ? `model output JSON parse: ${err.message}`
            : "model output JSON parse failed",
      },
    };
  }

  return {
    json,
    diagnostics: {
      failureReason: "ok",
      httpStatus,
      tokens: parsed.usageMetadata?.totalTokenCount,
      rawResponse: truncate(text, RAW_RESPONSE_LOG_CHARS),
    },
  };
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

interface ValidatedExtract {
  ok: true;
  value: ExtractedSpec;
}
interface InvalidExtract {
  ok: false;
  detail: string;
}

function validateExtractedJson(
  json: unknown
): ValidatedExtract | InvalidExtract {
  if (typeof json !== "object" || json === null) {
    return { ok: false, detail: "top-level value is not an object" };
  }
  const root = json as Record<string, unknown>;
  if (typeof root.specs !== "object" || root.specs === null) {
    return { ok: false, detail: "missing or non-object `specs` field" };
  }

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
    ok: true,
    value: {
      specs,
      description,
      perFieldConfidence,
      rawHtmlExcerpt: "",
    },
  };
}

function validateMatchJson(
  json: unknown
): { ok: true; value: MatchResult } | { ok: false; detail: string } {
  if (typeof json !== "object" || json === null) {
    return { ok: false, detail: "top-level value is not an object" };
  }
  const root = json as { matches?: unknown; confidence?: unknown };
  if (typeof root.matches !== "boolean") {
    return { ok: false, detail: "`matches` is not a boolean" };
  }
  if (
    typeof root.confidence !== "number" ||
    !Number.isFinite(root.confidence)
  ) {
    return { ok: false, detail: "`confidence` is not a finite number" };
  }
  return {
    ok: true,
    value: {
      matches: root.matches,
      confidence: Math.min(1, Math.max(0, root.confidence)),
    },
  };
}

export function makeGeminiExtractor(deps: GeminiExtractorDeps): SpecExtractor {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = deps.model ?? "gemini-2.5-flash";
  const hasKey = deps.apiKey.length > 0;
  const endpoint = hasKey ? buildEndpoint(deps.apiKey, model) : "";

  return {
    id: model,
    async match(html, equipment, candidate): Promise<MatchOutcome> {
      if (!hasKey) {
        return {
          result: null,
          diagnostics: {
            failureReason: "missing_api_key",
            validationDetail: "GEMINI_API_KEY not set",
          },
        };
      }
      const cleaned = cleanHtml(html, { maxChars: 4000 });
      const userText = [
        `Reference: ${equipment.brand} ${equipment.name}`.trim(),
        `Candidate URL: ${candidate.url}`,
        `Candidate title: ${candidate.title}`,
        `First section of candidate page:\n${cleaned}`,
      ].join("\n");

      const call = await callGemini(
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

      if (call.diagnostics.failureReason !== "ok") {
        return { result: null, diagnostics: call.diagnostics };
      }

      if (call.diagnostics.tokens !== undefined) {
        Logger.debug(
          `gemini.match tokens=${call.diagnostics.tokens}`,
          createLogContext("spec-sourcing-gemini", {
            kind: "match",
            tokens: call.diagnostics.tokens,
          })
        );
      }

      const validated = validateMatchJson(call.json);
      if (!validated.ok) {
        return {
          result: null,
          diagnostics: {
            ...call.diagnostics,
            failureReason: "schema_invalid",
            validationDetail: validated.detail,
          },
        };
      }
      return { result: validated.value, diagnostics: call.diagnostics };
    },
    async extract(html, equipment): Promise<ExtractOutcome> {
      if (!hasKey) {
        return {
          result: null,
          diagnostics: {
            failureReason: "missing_api_key",
            validationDetail: "GEMINI_API_KEY not set",
          },
        };
      }
      const cleaned = cleanHtml(html, { maxChars: 30_000 });
      const excerpt = takeExcerpt(html, 1024);
      const userText = [
        `Equipment: ${equipment.brand} ${equipment.name}`.trim(),
        `Category: ${equipment.category ?? "unknown"}${
          equipment.subcategory ? ` (${equipment.subcategory})` : ""
        }`,
        `Page HTML (cleaned, possibly truncated):\n${cleaned}`,
      ].join("\n");

      const call = await callGemini(
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

      if (call.diagnostics.failureReason !== "ok") {
        return { result: null, diagnostics: call.diagnostics };
      }

      if (call.diagnostics.tokens !== undefined) {
        Logger.debug(
          `gemini.extract tokens=${call.diagnostics.tokens}`,
          createLogContext("spec-sourcing-gemini", {
            kind: "extract",
            tokens: call.diagnostics.tokens,
          })
        );
      }

      const validated = validateExtractedJson(call.json);
      if (!validated.ok) {
        return {
          result: null,
          diagnostics: {
            ...call.diagnostics,
            failureReason: "schema_invalid",
            validationDetail: validated.detail,
          },
        };
      }
      return {
        result: { ...validated.value, rawHtmlExcerpt: excerpt },
        diagnostics: call.diagnostics,
      };
    },
  };
}

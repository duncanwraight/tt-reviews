import type { SubmissionType } from "~/lib/types";

/**
 * Server-side input validation at the submission boundary
 * (SECURITY.md Phase 7, TT-16).
 *
 * Before this existed, `submissions.$type.submit.tsx` wrote form fields
 * directly via the service-role client (bypassing RLS) with no length,
 * type, or URL validation. Phase 4 handles render-time sanitisation;
 * this layer pins storage-shape limits and closes off `javascript:` /
 * `data:` / SSRF-in-waiting payloads at the boundary.
 */

type FieldKind =
  | { kind: "text"; maxLength: number; pattern?: RegExp }
  | { kind: "url"; requireHttps: boolean; maxLength: number }
  | { kind: "integer"; min: number; max: number }
  | { kind: "decimal"; min: number; max: number }
  | { kind: "uuid" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "json"; maxLength: number };

interface FieldConstraint {
  required?: boolean;
  spec: FieldKind;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kept in sync with the field lists in `registry.ts` and the auxiliary
// fields extracted in `submissions.$type.submit.tsx`. Dynamic selects
// (category, birth_country, etc.) get length caps but not full enum
// checks — the dynamic option set lives in the DB and would require a
// round-trip to verify here; the point of this layer is cheap structural
// rejection, not business-logic validation.
const SUBMISSION_CONSTRAINTS: Record<
  SubmissionType,
  Record<string, FieldConstraint>
> = {
  equipment: {
    name: { required: true, spec: { kind: "text", maxLength: 200 } },
    manufacturer: { required: true, spec: { kind: "text", maxLength: 200 } },
    category: { required: true, spec: { kind: "text", maxLength: 50 } },
    subcategory: { spec: { kind: "text", maxLength: 50 } },
    specifications: { spec: { kind: "text", maxLength: 5000 } },
  },

  player: {
    name: { required: true, spec: { kind: "text", maxLength: 200 } },
    highest_rating: { spec: { kind: "text", maxLength: 50 } },
    active_years: { spec: { kind: "text", maxLength: 50 } },
    playing_style: { spec: { kind: "text", maxLength: 50 } },
    birth_country: { spec: { kind: "text", maxLength: 10 } },
    represents: { spec: { kind: "text", maxLength: 10 } },
    videos: { spec: { kind: "json", maxLength: 10000 } },
  },

  player_edit: {
    player_id: { required: true, spec: { kind: "uuid" } },
    name: { spec: { kind: "text", maxLength: 200 } },
    highest_rating: { spec: { kind: "text", maxLength: 50 } },
    active_years: { spec: { kind: "text", maxLength: 50 } },
    playing_style: { spec: { kind: "text", maxLength: 50 } },
    active: { spec: { kind: "enum", values: ["true", "false"] } },
    edit_reason: { required: true, spec: { kind: "text", maxLength: 2000 } },
  },

  video: {
    player_id: { required: true, spec: { kind: "uuid" } },
    videos: { required: true, spec: { kind: "json", maxLength: 20000 } },
  },

  review: {
    equipment_id: { required: true, spec: { kind: "uuid" } },
    playing_level: {
      required: true,
      spec: {
        kind: "enum",
        values: ["beginner", "intermediate", "advanced", "professional"],
      },
    },
    experience_duration: {
      required: true,
      spec: {
        kind: "enum",
        values: [
          "less_than_month",
          "1_to_3_months",
          "3_to_6_months",
          "6_months_to_year",
          "over_year",
        ],
      },
    },
    overall_rating: {
      required: true,
      spec: { kind: "decimal", min: 1, max: 10 },
    },
    rating_categories: { spec: { kind: "json", maxLength: 2000 } },
    review_text: { required: true, spec: { kind: "text", maxLength: 5000 } },
  },

  player_equipment_setup: {
    player_id: { required: true, spec: { kind: "uuid" } },
    year: { spec: { kind: "integer", min: 1900, max: 2100 } },
    blade_id: { spec: { kind: "uuid" } },
    forehand_rubber_id: { spec: { kind: "uuid" } },
    backhand_rubber_id: { spec: { kind: "uuid" } },
    forehand_thickness: { spec: { kind: "text", maxLength: 20 } },
    backhand_thickness: { spec: { kind: "text", maxLength: 20 } },
    forehand_side: { spec: { kind: "enum", values: ["black", "red"] } },
    backhand_side: { spec: { kind: "enum", values: ["black", "red"] } },
    source_type: { spec: { kind: "text", maxLength: 50 } },
    source_url: {
      spec: { kind: "url", requireHttps: true, maxLength: 2048 },
    },
  },
};

export interface ValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}

export function validateSubmission(
  type: SubmissionType,
  formData: FormData
): ValidationResult {
  const constraints = SUBMISSION_CONSTRAINTS[type];
  if (!constraints) {
    return { valid: false, errors: { _form: "Unknown submission type" } };
  }

  const errors: Record<string, string> = {};

  for (const [fieldName, constraint] of Object.entries(constraints)) {
    const raw = formData.get(fieldName);
    const value = typeof raw === "string" ? raw : null;

    if (!value) {
      if (constraint.required) {
        errors[fieldName] = `${fieldName} is required`;
      }
      continue;
    }

    const fieldError = validateField(value, constraint.spec);
    if (fieldError) {
      errors[fieldName] = fieldError;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

function validateField(value: string, spec: FieldKind): string | null {
  switch (spec.kind) {
    case "text":
      if (value.length > spec.maxLength) {
        return `must be ${spec.maxLength} characters or fewer`;
      }
      if (spec.pattern && !spec.pattern.test(value)) {
        return "format is invalid";
      }
      return null;

    case "url":
      return validateUrl(value, spec.requireHttps, spec.maxLength);

    case "integer": {
      if (!/^-?\d+$/.test(value)) return "must be an integer";
      const n = parseInt(value, 10);
      if (n < spec.min || n > spec.max) {
        return `must be between ${spec.min} and ${spec.max}`;
      }
      return null;
    }

    case "decimal": {
      if (!/^-?\d+(\.\d+)?$/.test(value)) return "must be a number";
      const n = parseFloat(value);
      if (Number.isNaN(n) || n < spec.min || n > spec.max) {
        return `must be between ${spec.min} and ${spec.max}`;
      }
      return null;
    }

    case "uuid":
      return UUID_RE.test(value) ? null : "must be a valid UUID";

    case "enum":
      return spec.values.includes(value)
        ? null
        : `must be one of: ${spec.values.join(", ")}`;

    case "json":
      if (value.length > spec.maxLength) {
        return `payload too large (max ${spec.maxLength} chars)`;
      }
      try {
        JSON.parse(value);
        return null;
      } catch {
        return "must be valid JSON";
      }
  }
}

// Reject javascript:, data:, vbscript:, ws:, ftp: etc. Parse with the
// URL API (throws on malformed). Optionally require https://. Block
// loopback, link-local, RFC1918 private ranges so a later enricher
// (e.g. a Worker that fetches the URL for metadata) can't be steered
// into internal services.
export function validateUrl(
  value: string,
  requireHttps: boolean,
  maxLength: number
): string | null {
  if (value.length > maxLength) return `URL too long (max ${maxLength} chars)`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be a valid URL";
  }

  const allowedProtocols = requireHttps ? ["https:"] : ["http:", "https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    return requireHttps
      ? "URL must use https://"
      : "URL must use http:// or https://";
  }

  if (isPrivateOrLocalHost(url.hostname)) {
    return "URL cannot point at a private or local address";
  }

  return null;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "[::1]"
  ) {
    return true;
  }

  // IPv4 private ranges — parsing is simpler than a single regex
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4;
    const a1 = parseInt(a, 10);
    const b1 = parseInt(b, 10);
    if (a1 === 10) return true;
    if (a1 === 127) return true;
    if (a1 === 169 && b1 === 254) return true;
    if (a1 === 172 && b1 >= 16 && b1 <= 31) return true;
    if (a1 === 192 && b1 === 168) return true;
    return false;
  }

  // IPv6: anything starting with fc/fd (ULA) or fe80: (link-local)
  if (h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80:")) {
    return true;
  }

  // .local mDNS
  if (h.endsWith(".local")) return true;

  return false;
}

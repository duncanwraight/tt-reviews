import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SUBMISSION_REGISTRY, SUBMISSION_TYPE_VALUES } from "../registry";

/**
 * Pins the canonical submission-type set against two other sources of
 * truth that have drifted in the past:
 *
 *   1. SUBMISSION_REGISTRY's own keys (a value listed in the union but
 *      missing from the registry would crash form rendering).
 *   2. The moderator_approvals.submission_type CHECK constraint in the
 *      most recent migration (a value missing here would silently
 *      produce empty admin queues — exactly the bug Phase 4 / TT-10
 *      was raised to fix).
 */

const MIGRATIONS_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations"
);

function readLatestSubmissionTypeCheck(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort(); // timestamp-prefixed → lexical sort = chronological

  let latest: string[] | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    // Match: ... moderator_approvals_submission_type_check ... CHECK ((... ARRAY[...] ... ))
    // We want the literal string list inside the most recent ARRAY[...].
    const re =
      /moderator_approvals_submission_type_check[\s\S]*?CHECK[\s\S]*?ARRAY\[([^\]]+)\]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const values = m[1]
        .split(",")
        .map(s => s.trim())
        // 'equipment'::text → equipment
        .map(s => s.replace(/^'([^']+)'(?:::text)?$/, "$1"))
        .filter(Boolean);
      if (values.length > 0) latest = values;
    }
  }
  if (!latest) {
    throw new Error(
      "No moderator_approvals_submission_type_check ARRAY[...] found in migrations"
    );
  }
  return latest;
}

describe("submission type — single source of truth", () => {
  it("SUBMISSION_REGISTRY has an entry for every value in SUBMISSION_TYPE_VALUES", () => {
    const registryKeys = Object.keys(SUBMISSION_REGISTRY).sort();
    const tupleValues = [...SUBMISSION_TYPE_VALUES].sort();
    expect(registryKeys).toEqual(tupleValues);
  });

  it("SUBMISSION_TYPE_VALUES matches the latest moderator_approvals CHECK constraint", () => {
    const dbValues = readLatestSubmissionTypeCheck().sort();
    const tupleValues = [...SUBMISSION_TYPE_VALUES].sort();
    expect(tupleValues).toEqual(dbValues);
  });
});

/**
 * Form-UX consistency lints. The rules these enforce are documented in
 * `docs/CODING-STANDARDS.md` → "Submission forms"; the tests are here so
 * regressions fail in CI rather than in a moderator's UI eyeball pass.
 */
describe("form-UX consistency", () => {
  it("no field label carries an '(Optional)' suffix", () => {
    // Required fields render a red asterisk via FormField; optional
    // fields render nothing. Mixing in an "(Optional)" suffix on
    // some optional labels (and not others) was inconsistent and
    // visually noisy — the absence of the asterisk is the marker.
    const offenders: string[] = [];
    for (const [type, config] of Object.entries(SUBMISSION_REGISTRY)) {
      for (const field of config.form.fields) {
        if (/\(Optional\)/i.test(field.label)) {
          offenders.push(`${type}.${field.name}: "${field.label}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("player_edit text fields use the 'Leave blank to keep current X' placeholder", () => {
    // player_edit doesn't pre-fill text fields — empty submission is
    // interpreted as "no change to that field" by the action. The
    // placeholder makes that semantic visible. (equipment_edit uses
    // the opposite paradigm — pre-fill + diff — and intentionally
    // doesn't share this placeholder; tracked in TT-129.)
    const offenders: string[] = [];
    for (const field of SUBMISSION_REGISTRY.player_edit.form.fields) {
      if (
        (field.type !== "text" && field.type !== "textarea") ||
        field.required
      ) {
        continue;
      }
      const placeholder = field.placeholder || "";
      if (!placeholder.startsWith("Leave blank to keep current")) {
        offenders.push(`player_edit.${field.name}: "${placeholder}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

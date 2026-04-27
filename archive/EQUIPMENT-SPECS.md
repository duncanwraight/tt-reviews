# Structured manufacturer spec storage — locked design

Locked design for TT-72. Output of TT-73 (audit). Children (migration, admin/submission forms, specs table display, TT-25 follow-up, future search) implement against this; if any of them needs to deviate, update this doc first.

## Why

`equipment.specifications` is JSONB with free-form string values today (`"86g"`, `"5.7mm"`, `"40-42"`). That blocks:

- Cleaner display on the comparison page (TT-25).
- A stronger manufacturer-attribute branch in similarity scoring (TT-26).
- **Range filters and faceted search** — the long-term goal that this refactor unlocks. Plies, weight, thickness, hardness are all things players genuinely filter on.
- Type-checked entry at submission time instead of garbage-in-string-out.

## Decisions summary

- **Canonical scale** for ratings (Speed/Spin/Control). The seed already normalises to ~0..10, so this is a confirmation, not a change. Manufacturers using other scales (DHS 0..100, Butterfly 5-step categorical) get converted at submission time.
- **`scale_min` / `scale_max` are display hints, not hard caps.** Some manufacturers publish values >10 for speed/spin; rejecting those at write time would lose real data. Validation just enforces "is a number"; UI shows the typical range as guidance.
- **Plies splits into two fields.** `plies_wood` (int, required) + `plies_composite` (int, nullable for pure-wood). Searchable independently, rendered combined ("5+2" / "5") at display time. This is more flexible than a bespoke compound type and falls naturally out of the existing one-row-per-spec-field model.
- **Hardness is a range.** `{min, max}` always; single-value manufacturer data stored as `{min: X, max: X}`. No separate "is this a range" flag.
- **`material` / `sponge` / `topsheet` stay text** for now. Values are inconsistent across manufacturers (`"Spring Sponge"` vs `"Spring Sponge X"`, `"Tensor"` vs `"High Tension"`); enum-ification needs a curation pass first. Out of scope here.
- **`year` is text** per product call — it's a label, not something we sort or filter on numerically.

## Schema additions

Three new columns on `categories` (only meaningful for rows where `type = 'equipment_spec_field'`, but added on the table since spec fields piggyback on `categories`):

```sql
CREATE TYPE spec_field_type AS ENUM ('int', 'float', 'range', 'text');

ALTER TABLE categories
  ADD COLUMN field_type spec_field_type,
  ADD COLUMN unit VARCHAR(16),
  ADD COLUMN scale_min NUMERIC,
  ADD COLUMN scale_max NUMERIC;

-- Constraint: field_type required for spec fields, NULL otherwise.
ALTER TABLE categories ADD CONSTRAINT categories_spec_field_type_required
  CHECK (
    (type = 'equipment_spec_field' AND field_type IS NOT NULL)
    OR (type <> 'equipment_spec_field' AND field_type IS NULL)
  );
```

Notes:

- `unit` is a free-form short label (`"mm"`, `"g"`). Closed set today (`mm`, `g`) but left unconstrained so admins can add new units (e.g., `"mm"` for pip length later) without a migration.
- `scale_min` / `scale_max` apply only to `int` / `float`. Used by the UI to label inputs and (eventually) seed range-filter defaults. Not enforced as bounds.
- `unit` and `scale_*` are NULL for `text` and `range` fields (range fields don't carry a unit today, but the column is available if needed).

## Storage shapes in `equipment.specifications` JSONB

| `field_type` | JSONB value example                  | Notes                                                                |
| ------------ | ------------------------------------ | -------------------------------------------------------------------- |
| `int`        | `"weight": 86`                       | Plain integer.                                                       |
| `float`      | `"thickness": 5.7`, `"speed": 9.8`   | Plain number.                                                        |
| `range`      | `"hardness": {"min": 40, "max": 42}` | Both keys required. `min == max` for single-value manufacturer data. |
| `text`       | `"material": "Arylate Carbon"`       | Plain string.                                                        |

`SpecsTable` (and any future search predicate) reads `field_type` from the spec-field row to know how to interpret the value.

## Field-by-field migration map

For every `equipment_spec_field` row currently seeded:

| Field             | Scope (parent)                             | `field_type` | `unit` | `scale_min` | `scale_max` | Migration from existing data                                                                        |
| ----------------- | ------------------------------------------ | ------------ | ------ | ----------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `thickness`       | blade                                      | `float`      | `mm`   | —           | —           | `parseFloat(strip "mm")` — `"5.7mm"` → `5.7`                                                        |
| `weight`          | blade                                      | `int`        | `g`    | —           | —           | `parseInt(strip "g")` — `"86g"` → `86`                                                              |
| `plies_wood`      | blade                                      | `int`        | —      | —           | —           | Rename existing `plies` (all current values are pure-wood total).                                   |
| `plies_composite` | blade                                      | `int`        | —      | —           | —           | New field; NULL for all existing rows.                                                              |
| `material`        | blade                                      | `text`       | —      | —           | —           | Passthrough.                                                                                        |
| `speed`           | blade + inverted/anti/long_pips/short_pips | `float`      | —      | `0`         | `10`        | Already numeric; passthrough.                                                                       |
| `control`         | blade + inverted/anti/long_pips/short_pips | `float`      | —      | `0`         | `10`        | Already numeric; passthrough.                                                                       |
| `spin`            | inverted/anti/long_pips/short_pips         | `float`      | —      | `0`         | `10`        | Already numeric; passthrough.                                                                       |
| `sponge`          | inverted/anti/long_pips/short_pips         | `text`       | —      | —           | —           | Passthrough.                                                                                        |
| `topsheet`        | inverted/anti/long_pips/short_pips         | `text`       | —      | —           | —           | Passthrough.                                                                                        |
| `hardness`        | inverted                                   | `range`      | —      | —           | —           | Parse: `"40"` → `{min:40, max:40}`; `"40-42"` → `{min:40, max:42}`; `"36-38"` → `{min:36, max:38}`. |
| `year`            | inverted                                   | `text`       | —      | —           | —           | Cast int → string: `2019` → `"2019"`.                                                               |

Edge cases the migration must handle:

- Existing `weight` values are integer-string with `g` suffix (`"86g"`). No floats observed in seed; if any sneak in via prod data, round to nearest int with a logged warning.
- Existing `thickness` values are float-string with `mm` suffix (`"5.7mm"`, `"6.0mm"`). Always one decimal.
- Existing `hardness` values are mostly bare numeric strings (`"36"`, `"47.5"`); ranges are `"40-42"` form. No other separators observed (no `~`, no `–` em-dash, no `to`). If unexpected formats appear, fail the migration loudly rather than silently dropping them.
- Existing `plies` is always a single integer in seed. Future entries via the new admin form will set both `plies_wood` and `plies_composite` directly.

## Search implications

The new field metadata is what makes faceted search tractable — every consumer can switch on `field_type` to know how to filter:

| `field_type`  | Filter UI shape                      | DB predicate shape                                                                                                |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `int`/`float` | Min/max numeric inputs (range)       | `(specifications->>'weight')::numeric BETWEEN $min AND $max`                                                      |
| `range`       | Overlap match: "hardness within X-Y" | `(specifications->'hardness'->>'max')::numeric >= $min AND (specifications->'hardness'->>'min')::numeric <= $max` |
| `text`        | Multi-select / contains              | `specifications->>'material' = ANY($values)`                                                                      |

Search itself is **not implemented as part of TT-72**. It's a downstream child item filed when the comparison page (TT-25) and similar-equipment (TT-26) work has settled. But the schema put in place by this refactor is the precondition.

## Out of scope

- **Enum-ification** of `material` / `sponge` / `topsheet`. Values today are inconsistent free-text; locking them down requires a curation pass that's its own piece of work.
- **Ball spec fields.** None seeded; admin can add via the configurable categories UI when data appears.
- **Pip length** (mm) for pips topsheets — not currently captured at all. Out of scope.
- **A search/filter UI.** The schema enables it; building it is a separate child filed after this refactor lands.
- **Validating `scale_min` / `scale_max` as hard bounds.** Display-only.

## Implementation children (filed under TT-72)

- **TT-75** — Migration + display, bundled. Schema additions + data migration of existing `equipment.specifications` rows + reseed of `equipment_spec_field` categories with `field_type` / `unit` / `scale_*` populated, plus the `SpecsTable.tsx` switch on `field_type`. Bundled because the JSONB shape change breaks the old `String(raw)` rendering, so they have to ship atomically.
- **TT-76** — Typed admin / submission forms. Read `field_type` from the spec-field row, render typed inputs, validate "is a number" / "min ≤ max" / plies compound shape.
- **TT-77** — TT-25 follow-up: sortable numeric columns once values are typed.

Don't expand TT-72's body with implementation TODOs — file children.

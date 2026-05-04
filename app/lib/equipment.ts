// Single source of truth for equipment-card pill styling and subcategory labels.
// Used by EquipmentCard so all three call sites (homepage, /equipment, search)
// render the same chrome.

const CATEGORY_PILL_CLASSES: Record<string, string> = {
  blade: "text-purple-800 bg-purple-100",
  rubber: "text-pink-800 bg-pink-100",
};

const NEUTRAL_PILL_CLASSES = "text-gray-800 bg-gray-100";

export function getCategoryPillClasses(category: string): string {
  return CATEGORY_PILL_CLASSES[category] ?? NEUTRAL_PILL_CLASSES;
}

export function getSubcategoryPillClasses(): string {
  return NEUTRAL_PILL_CLASSES;
}

const SUBCATEGORY_LABELS: Record<string, string> = {
  inverted: "Inverted",
  long_pips: "Long Pips",
  anti: "Anti-Spin",
  short_pips: "Short Pips",
};

export function formatSubcategoryLabel(subcategory: string): string {
  return (
    SUBCATEGORY_LABELS[subcategory] ??
    subcategory.charAt(0).toUpperCase() + subcategory.slice(1)
  );
}

// Canonical "<brand> <model>" display string. equipment.name carries only the
// bare model after TT-163 — anywhere we want to surface a user-facing title
// goes through this so brand and model stay assembled the same way.
export function displayEquipmentName(equipment: {
  manufacturer: string;
  name: string;
}): string {
  return `${equipment.manufacturer} ${equipment.name}`;
}

// Mirror of the SQL strip_manufacturer_prefix used in the TT-163 migration.
// equipment.name must be the bare model — this normalises imports / external
// payloads that arrive in "<brand> <model>" form. Form-level validation
// (equipment-create / equipment-edit) rejects rather than normalises so the
// submitter learns the rule; importers normalise so admins don't have to
// hand-clean every batch.
export function stripManufacturerPrefix(
  name: string,
  manufacturer: string
): string {
  if (!manufacturer) return name;
  const prefix = `${manufacturer} `;
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return name.slice(prefix.length);
  }
  return name;
}

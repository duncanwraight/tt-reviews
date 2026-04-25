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

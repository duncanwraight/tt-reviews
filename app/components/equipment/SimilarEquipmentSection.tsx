import { EquipmentCard } from "~/components/ui/EquipmentCard";

interface EquipmentDisplay {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
  image_key?: string;
}

interface SimilarEquipmentSectionProps {
  category: string;
  equipment: EquipmentDisplay[];
}

const MIN_ITEMS = 2;

// Hide the section entirely when there's only a single recommendation —
// "similar to this" with one card reads as filler rather than a useful
// shortlist. The "Browse All …" CTA below still gives the user an exit.
export function SimilarEquipmentSection({
  category,
  equipment,
}: SimilarEquipmentSectionProps) {
  if (equipment.length < MIN_ITEMS) return null;

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <section
      aria-labelledby="similar-equipment-heading"
      data-testid="similar-equipment-section"
    >
      <h2
        id="similar-equipment-heading"
        className="mb-6 text-2xl font-bold text-gray-900"
      >
        Similar {categoryLabel}s
      </h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {equipment.map(item => (
          <EquipmentCard key={item.id} equipment={item} />
        ))}
      </div>
    </section>
  );
}

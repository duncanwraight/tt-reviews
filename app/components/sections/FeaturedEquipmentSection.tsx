import { Link } from "react-router";
import { EquipmentCard } from "../ui/EquipmentCard";

interface EquipmentDisplay {
  id: string;
  name: string;
  slug: string;
  category: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
}

interface FeaturedEquipmentSectionProps {
  equipment: EquipmentDisplay[];
}

export function FeaturedEquipmentSection({
  equipment,
}: FeaturedEquipmentSectionProps) {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Featured Equipment
          </h2>
          <p className="text-lg text-gray-600">
            Professional-grade equipment trusted by top players
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {equipment.map(item => (
            <EquipmentCard key={item.id} equipment={item} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/equipment"
            className="inline-flex items-center px-6 py-3 border border-purple-600 text-purple-600 font-semibold rounded-lg hover:bg-purple-600 hover:text-white transition-colors"
          >
            View All Equipment
          </Link>
        </div>
      </div>
    </section>
  );
}

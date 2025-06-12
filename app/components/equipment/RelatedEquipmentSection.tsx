import { Link } from "react-router";

interface RelatedEquipmentSectionProps {
  category: string;
}

export function RelatedEquipmentSection({ category }: RelatedEquipmentSectionProps) {
  const getCategoryName = (cat: string) => {
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  return (
    <section className="py-12 bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader category={category} />
        <SectionAction category={category} />
      </div>
    </section>
  );
}

function SectionHeader({ category }: { category: string }) {
  const getCategoryName = (cat: string) => {
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  return (
    <div className="text-center mb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        More {getCategoryName(category)}s
      </h2>
      <p className="text-gray-600">
        Explore other {category}s in our database
      </p>
    </div>
  );
}

function SectionAction({ category }: { category: string }) {
  const getCategoryName = (cat: string) => {
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  return (
    <div className="flex justify-center">
      <Link
        to={`/equipment?category=${category}`}
        className="inline-flex items-center px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
      >
        Browse All {getCategoryName(category)}s
      </Link>
    </div>
  );
}
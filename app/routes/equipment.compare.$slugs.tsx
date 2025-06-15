import type { Route } from "./+types/equipment.compare.$slugs";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { schemaService } from "~/lib/schema.server";
import { data, redirect } from "react-router";
import { Link } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { ComparisonTable } from "~/components/equipment/ComparisonTable";
import { ComparisonHeader } from "~/components/equipment/ComparisonHeader";
import { ComparisonConclusion } from "~/components/equipment/ComparisonConclusion";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const db = new DatabaseService(context);

  // Parse equipment slugs from URL parameter (format: "slug1-vs-slug2")
  const slugsParam = params.slugs;
  if (!slugsParam || !slugsParam.includes('-vs-')) {
    throw redirect('/equipment', { headers: sbServerClient.headers });
  }

  const [slug1, slug2] = slugsParam.split('-vs-');
  if (!slug1 || !slug2) {
    throw redirect('/equipment', { headers: sbServerClient.headers });
  }

  // Fetch both equipment items
  const [equipment1, equipment2] = await Promise.all([
    db.getEquipment(slug1),
    db.getEquipment(slug2)
  ]);

  if (!equipment1 || !equipment2) {
    throw redirect('/equipment', { headers: sbServerClient.headers });
  }

  // Ensure equipment are comparable (same category)
  if (equipment1.category !== equipment2.category) {
    throw redirect(`/equipment/${equipment1.slug}`, { headers: sbServerClient.headers });
  }

  // Get reviews and ratings for both equipment
  const [reviews1, reviews2, usedByPlayers1, usedByPlayers2] = await Promise.all([
    db.getEquipmentReviews(equipment1.id),
    db.getEquipmentReviews(equipment2.id),
    db.getPlayersUsingEquipment(equipment1.id),
    db.getPlayersUsingEquipment(equipment2.id)
  ]);

  // Calculate average ratings
  const averageRating1 = reviews1.length > 0 
    ? reviews1.reduce((sum, review) => sum + review.overall_rating, 0) / reviews1.length 
    : null;
  
  const averageRating2 = reviews2.length > 0 
    ? reviews2.reduce((sum, review) => sum + review.overall_rating, 0) / reviews2.length 
    : null;

  // Generate structured data for comparison
  const comparisonSchema = schemaService.generateComparisonSchema({
    equipment1: { ...equipment1, averageRating: averageRating1, reviewCount: reviews1.length },
    equipment2: { ...equipment2, averageRating: averageRating2, reviewCount: reviews2.length },
    usedByPlayers1,
    usedByPlayers2
  });

  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { name: 'Equipment', url: '/equipment' },
    { name: `${equipment1.category}`, url: `/equipment?category=${equipment1.category}` },
    { name: `${equipment1.name} vs ${equipment2.name}`, url: `/equipment/compare/${slugsParam}` }
  ]);

  const schemaJsonLd = schemaService.generateMultipleSchemas([comparisonSchema, breadcrumbSchema]);

  return data({
    equipment1,
    equipment2,
    reviews1,
    reviews2,
    averageRating1,
    averageRating2,
    usedByPlayers1,
    usedByPlayers2,
    schemaJsonLd,
  }, { headers: sbServerClient.headers });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.equipment1 || !data?.equipment2) {
    return [
      { title: "Equipment Comparison Not Found | TT Reviews" },
      {
        name: "description",
        content: "The requested equipment comparison could not be found.",
      },
    ];
  }

  const { equipment1, equipment2, reviews1 = [], reviews2 = [], averageRating1, averageRating2 } = data;
  
  // Enhanced SEO title pattern for comparison pages
  const title = `${equipment1.name} vs ${equipment2.name} - Detailed Comparison | TT Reviews`;
  
  // Enhanced meta description with comparison highlights
  const rating1Text = averageRating1 ? `${averageRating1.toFixed(1)}/5` : 'unrated';
  const rating2Text = averageRating2 ? `${averageRating2.toFixed(1)}/5` : 'unrated';
  
  const description = `Compare ${equipment1.name} (${rating1Text}, ${reviews1.length} reviews) vs ${equipment2.name} (${rating2Text}, ${reviews2.length} reviews). Detailed specs, pro usage, and community ratings comparison.`;
  
  // Enhanced keywords for comparison targeting
  const keywords = [
    `${equipment1.name} vs ${equipment2.name}`,
    `${equipment2.name} vs ${equipment1.name}`,
    `${equipment1.name} comparison`,
    `${equipment2.name} comparison`,
    `${equipment1.manufacturer} vs ${equipment2.manufacturer}`,
    `best ${equipment1.category}`,
    `${equipment1.category} comparison`,
    'table tennis equipment comparison',
    'professional table tennis equipment'
  ].join(', ');

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    {
      "script:ld+json": data.schemaJsonLd,
    },
  ];
}

export default function EquipmentComparison({ loaderData }: Route.ComponentProps) {
  const { 
    equipment1, 
    equipment2, 
    reviews1, 
    reviews2, 
    averageRating1, 
    averageRating2,
    usedByPlayers1,
    usedByPlayers2
  } = loaderData;

  const breadcrumbs = [
    { name: 'Equipment', href: '/equipment' },
    { name: equipment1.category, href: `/equipment?category=${equipment1.category}` },
    { name: `${equipment1.name} vs ${equipment2.name}`, href: '' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageSection className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb items={breadcrumbs} />
          
          <ComparisonHeader 
            equipment1={equipment1}
            equipment2={equipment2}
            averageRating1={averageRating1}
            averageRating2={averageRating2}
            reviewCount1={reviews1.length}
            reviewCount2={reviews2.length}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
            <div className="lg:col-span-8">
              <ComparisonTable 
                equipment1={equipment1}
                equipment2={equipment2}
                reviews1={reviews1}
                reviews2={reviews2}
                averageRating1={averageRating1}
                averageRating2={averageRating2}
              />
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Professional Usage
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">{equipment1.name}</h4>
                    {usedByPlayers1.length > 0 ? (
                      <div className="space-y-1">
                        {usedByPlayers1.slice(0, 5).map((player) => (
                          <Link
                            key={player.id}
                            to={`/players/${player.slug}`}
                            className="block text-sm text-purple-600 hover:text-purple-800"
                          >
                            {player.name}
                          </Link>
                        ))}
                        {usedByPlayers1.length > 5 && (
                          <p className="text-sm text-gray-500">
                            +{usedByPlayers1.length - 5} more players
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No professional usage tracked</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">{equipment2.name}</h4>
                    {usedByPlayers2.length > 0 ? (
                      <div className="space-y-1">
                        {usedByPlayers2.slice(0, 5).map((player) => (
                          <Link
                            key={player.id}
                            to={`/players/${player.slug}`}
                            className="block text-sm text-purple-600 hover:text-purple-800"
                          >
                            {player.name}
                          </Link>
                        ))}
                        {usedByPlayers2.length > 5 && (
                          <p className="text-sm text-gray-500">
                            +{usedByPlayers2.length - 5} more players
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No professional usage tracked</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <Link
                    to={`/equipment/${equipment1.slug}`}
                    className="block w-full text-center bg-purple-100 text-purple-700 py-2 px-4 rounded-md hover:bg-purple-200 transition-colors text-sm font-medium"
                  >
                    View {equipment1.name} Details
                  </Link>
                  <Link
                    to={`/equipment/${equipment2.slug}`}
                    className="block w-full text-center bg-purple-100 text-purple-700 py-2 px-4 rounded-md hover:bg-purple-200 transition-colors text-sm font-medium"
                  >
                    View {equipment2.name} Details
                  </Link>
                  <Link
                    to={`/equipment?category=${equipment1.category}`}
                    className="block w-full text-center bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Browse All {equipment1.category}s
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <ComparisonConclusion 
            equipment1={equipment1}
            equipment2={equipment2}
            averageRating1={averageRating1}
            averageRating2={averageRating2}
            reviews1={reviews1}
            reviews2={reviews2}
          />
        </div>
      </PageSection>
    </div>
  );
}
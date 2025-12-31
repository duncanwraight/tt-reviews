import type { Route } from "./+types/equipment.$slug";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { schemaService } from "~/lib/schema.server";
import { data, redirect } from "react-router";
import {
  withLoaderCorrelation,
  enhanceContextWithUser,
  logUserAction,
} from "~/lib/middleware/correlation.server";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { EquipmentHeader } from "~/components/equipment/EquipmentHeader";
import { ReviewsSection } from "~/components/equipment/ReviewsSection";
import { RelatedEquipmentSection } from "~/components/equipment/RelatedEquipmentSection";
// DISABLED: Comparison feature - see /todo/FEATURES.md
// import { ComparisonSection } from "~/components/equipment/ComparisonSection";

export function meta({ data }: Route.MetaArgs) {
  if (!data?.equipment) {
    return [
      { title: "Equipment Not Found | TT Reviews" },
      {
        name: "description",
        content: "The requested equipment could not be found.",
      },
    ];
  }

  const { equipment, reviews = [], averageRating, usedByPlayers = [] } = data;

  // Enhanced SEO title pattern based on research
  const titleSuffix = "Review - Specs, Player Usage & Ratings | TT Reviews";
  const title = `${equipment.name} ${titleSuffix}`;

  // Enhanced meta description with review stats and player usage
  const reviewCount = reviews.length;
  const ratingText = averageRating
    ? `avg ${averageRating.toFixed(1)} rating`
    : "professional reviews";
  const playerUsage =
    usedByPlayers.length > 0
      ? ` Used by ${usedByPlayers
          .slice(0, 3)
          .map(p => p.name)
          .join(", ")}${usedByPlayers.length > 3 ? " and others" : ""}.`
      : "";

  const description = `${equipment.name} by ${equipment.manufacturer} - ${reviewCount} ${ratingText}.${playerUsage} Complete specs and community ratings.`;

  // Enhanced keywords targeting high-value search terms
  const keywords = [
    equipment.name,
    `${equipment.name} review`,
    `${equipment.manufacturer} ${equipment.name}`,
    equipment.manufacturer,
    equipment.category,
    equipment.subcategory,
    `${equipment.category} review`,
    `best ${equipment.category}`,
    "table tennis equipment",
    "professional equipment",
  ]
    .filter(Boolean)
    .join(", ");

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    {
      property: "og:title",
      content: `${equipment.name} by ${equipment.manufacturer}`,
    },
    { property: "og:description", content: description },
    { property: "og:type", content: "product" },
    // Additional SEO meta tags
    { name: "robots", content: "index, follow" },
    { name: "author", content: "TT Reviews" },
    { property: "product:brand", content: equipment.manufacturer },
    { property: "product:category", content: equipment.category },
    { property: "og:site_name", content: "TT Reviews" },
    // Structured data hints for crawlers
    ...(averageRating
      ? [
          {
            property: "product:rating:value",
            content: averageRating.toString(),
          },
        ]
      : []),
    ...(reviewCount
      ? [{ property: "product:rating:count", content: reviewCount.toString() }]
      : []),
    // Structured data from loader
    ...(data?.multipleSchemas ? [{ "script:ld+json": data.multipleSchemas }] : []),
  ];
}

export const loader = withLoaderCorrelation(
  async ({
    params,
    request,
    context,
    logContext,
  }: Route.LoaderArgs & { logContext: any }) => {
    const { slug } = params;

    // Get user for context enhancement
    const sbServerClient = getServerClient(request, context);
    const userResponse = await sbServerClient.client.auth.getUser();
    const user = userResponse.data?.user;

    // Enhance log context with user information
    const enhancedContext = enhanceContextWithUser(logContext, user);

    // Create database service with logging context
    const db = new DatabaseService(context, enhancedContext);

    const equipment = await db.getEquipment(slug);

    if (!equipment) {
      throw redirect("/equipment", { status: 404 });
    }

    // Log user action for analytics
    logUserAction("view_equipment", enhancedContext, {
      equipment_id: equipment.id,
      equipment_name: equipment.name,
      manufacturer: equipment.manufacturer,
      category: equipment.category,
      subcategory: equipment.subcategory,
    });

    const categoryService = createCategoryService(sbServerClient.client);

    const [
      reviews,
      usedByPlayers,
      ratingCategories,
      generalRatingCategories,
      similarEquipment,
    ] = await Promise.all([
      db.getEquipmentReviews(equipment.id, "approved"),
      db.getPlayersUsingEquipment(equipment.id),
      categoryService.getReviewRatingCategories(equipment.subcategory),
      categoryService.getReviewRatingCategories(), // General categories without parent
      db.getSimilarEquipment(equipment.id),
    ]);

    // Combine all rating categories
    const allRatingCategories = [
      ...generalRatingCategories,
      ...ratingCategories,
    ].sort((a, b) => a.display_order - b.display_order);

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.overall_rating, 0) /
          reviews.length
        : 0;

    // Generate structured data schemas
    const equipmentSchema = schemaService.generateEquipmentSchema({
      ...equipment,
      averageRating,
      reviewCount: reviews.length,
      reviews,
    });

    const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Equipment", href: "/equipment" },
      { label: equipment.name },
    ]);
    const multipleSchemas = [equipmentSchema, breadcrumbSchema];

    return data(
      {
        user: userResponse?.data?.user || null,
        equipment,
        reviews,
        usedByPlayers,
        averageRating,
        reviewCount: reviews.length,
        ratingCategories: allRatingCategories,
        similarEquipment,
        multipleSchemas,
      },
      { headers: sbServerClient.headers }
    );
  }
);

export default function EquipmentDetail({ loaderData }: Route.ComponentProps) {
  const {
    user,
    equipment,
    reviews,
    usedByPlayers,
    averageRating,
    reviewCount,
    ratingCategories,
    similarEquipment,
  } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" },
    { label: equipment.name, current: true },
  ];

  return (
    <>
      <PageSection background="white" padding="small">
        <Breadcrumb items={breadcrumbItems} />
      </PageSection>

      <PageSection background="white" padding="medium">
        <EquipmentHeader
          equipment={equipment}
          averageRating={averageRating}
          reviewCount={reviewCount}
          usedByPlayers={usedByPlayers}
        />
      </PageSection>

      <ReviewsSection
        reviews={reviews}
        reviewCount={reviewCount}
        user={user}
        equipmentName={equipment.name}
        equipmentSlug={equipment.slug}
        ratingCategories={ratingCategories}
      />

      <PageSection background="gray" padding="medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            <RelatedEquipmentSection category={equipment.category} />
          </div>
          {/* DISABLED: Comparison feature - see /todo/FEATURES.md
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <RelatedEquipmentSection category={equipment.category} />
            </div>
            <div>
              <ComparisonSection
                currentEquipment={equipment}
                similarEquipment={similarEquipment}
              />
            </div>
          </div>
          */}
        </div>
      </PageSection>
    </>
  );
}

import type { Route } from "./+types/equipment.$slug";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { schemaService } from "~/lib/schema";
import { issueCSRFToken } from "~/lib/security.server";
import { data, redirect } from "react-router";
import {
  withLoaderCorrelation,
  enhanceContextWithUser,
  logUserAction,
} from "~/lib/middleware/correlation.server";
import { getUserWithRole } from "~/lib/auth.server";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { AdminTrimToggle } from "~/components/equipment/AdminTrimToggle";
import { AdminPhotoUpload } from "~/components/equipment/AdminPhotoUpload";
import { EquipmentHeader } from "~/components/equipment/EquipmentHeader";
import { ReviewsSection } from "~/components/equipment/ReviewsSection";
import { RelatedEquipmentSection } from "~/components/equipment/RelatedEquipmentSection";
import { SimilarEquipmentSection } from "~/components/equipment/SimilarEquipmentSection";
import { SpecsTable } from "~/components/equipment/SpecsTable";
import { SafeHtml } from "~/lib/sanitize";
import { StructuredData } from "~/components/seo/StructuredData";

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
    // JSON-LD is rendered via <StructuredData /> in the component so
    // user content (e.g. a review body containing "</script>") flows
    // through toJsonLd's `<` escape. React Router's `script:ld+json`
    // meta descriptor does not escape `<` in our version.
  ];
}

export const loader = withLoaderCorrelation(
  async ({
    params,
    request,
    context,
    logContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }: Route.LoaderArgs & { logContext: any }) => {
    const { slug } = params;

    // Get user for context enhancement. getUserWithRole decodes the
    // JWT to attach .role — used to gate the admin-only TT-88 trim
    // toggle without a DB lookup.
    const sbServerClient = getServerClient(request, context);
    const user = (await getUserWithRole(sbServerClient, context)) as
      | (Awaited<
          ReturnType<typeof sbServerClient.client.auth.getUser>
        >["data"]["user"] & { role?: string })
      | null;

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
      specFields,
      similarEquipmentRaw,
    ] = await Promise.all([
      db.getEquipmentReviews(equipment.id, "approved"),
      db.getPlayersUsingEquipment(equipment.id),
      categoryService.getReviewRatingCategories(
        equipment.category,
        equipment.subcategory
      ),
      categoryService.getEquipmentSpecFields(
        equipment.category,
        equipment.subcategory
      ),
      db.getRankedSimilarEquipment(equipment.id),
    ]);

    const similarEquipment = similarEquipmentRaw.map(item => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      category: item.category,
      subcategory: item.subcategory,
      manufacturer: item.manufacturer,
      image_key: item.image_key,
      rating: item.averageRating || undefined,
      reviewCount: item.reviewCount || 0,
    }));

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

    const isAdmin = user?.role === "admin";
    const adminCsrfToken = isAdmin
      ? await issueCSRFToken(request, context, user.id)
      : null;

    return data(
      {
        user: user || null,
        isAdmin,
        adminCsrfToken,
        equipment,
        reviews,
        usedByPlayers,
        averageRating,
        reviewCount: reviews.length,
        ratingCategories,
        specFields,
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
    isAdmin,
    adminCsrfToken,
    equipment,
    reviews,
    usedByPlayers,
    averageRating,
    reviewCount,
    ratingCategories,
    specFields,
    similarEquipment,
    multipleSchemas,
  } = loaderData;

  const specsItems = [
    {
      equipment,
      averageRating,
      reviewCount,
      reviews,
      usedByPlayers,
    },
  ];

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" },
    { label: equipment.name, current: true },
  ];

  return (
    <>
      {multipleSchemas && <StructuredData schema={multipleSchemas} />}
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
        {isAdmin && adminCsrfToken && equipment.image_key && (
          <AdminTrimToggle
            slug={equipment.slug}
            trimKind={equipment.image_trim_kind ?? null}
            csrfToken={adminCsrfToken}
          />
        )}
        {isAdmin && adminCsrfToken && (
          <AdminPhotoUpload
            slug={equipment.slug}
            hasImage={Boolean(equipment.image_key)}
            csrfToken={adminCsrfToken}
          />
        )}
      </PageSection>

      {equipment.description && (
        <PageSection background="white" padding="medium">
          <section aria-labelledby="description-heading">
            <h2
              id="description-heading"
              className="mb-3 text-xl font-semibold text-gray-900"
            >
              Manufacturer description
            </h2>
            <SafeHtml
              content={equipment.description}
              profile="review"
              className="text-gray-700 leading-relaxed whitespace-pre-wrap"
            />
          </section>
        </PageSection>
      )}

      <PageSection background="white" padding="medium">
        <section aria-labelledby="specs-heading">
          <h2
            id="specs-heading"
            className="mb-3 text-xl font-semibold text-gray-900"
          >
            Manufacturer specifications
          </h2>
          <SpecsTable items={specsItems} specFields={specFields} />
        </section>
      </PageSection>

      <ReviewsSection
        reviews={reviews}
        reviewCount={reviewCount}
        user={user}
        equipmentName={equipment.name}
        equipmentSlug={equipment.slug}
        ratingCategories={ratingCategories}
      />

      {similarEquipment.length >= 2 && (
        <PageSection background="white" padding="medium">
          <SimilarEquipmentSection
            category={equipment.category}
            equipment={similarEquipment}
          />
        </PageSection>
      )}

      <PageSection background="gray" padding="medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            <RelatedEquipmentSection category={equipment.category} />
          </div>
        </div>
      </PageSection>
    </>
  );
}

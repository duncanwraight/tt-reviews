import type { Route } from "./+types/equipment.$slug";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { data, redirect } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { EquipmentHeader } from "~/components/equipment/EquipmentHeader";
import { ReviewsSection } from "~/components/equipment/ReviewsSection";
import { RelatedEquipmentSection } from "~/components/equipment/RelatedEquipmentSection";

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

  const { equipment } = data;
  return [
    { title: `${equipment.name} by ${equipment.manufacturer} | TT Reviews` },
    {
      name: "description",
      content: `Read detailed reviews of the ${equipment.name} ${equipment.category} by ${equipment.manufacturer}. Professional insights and user experiences.`,
    },
    {
      name: "keywords",
      content: `${equipment.name}, ${equipment.manufacturer}, ${equipment.category}, table tennis equipment, reviews`,
    },
    {
      property: "og:title",
      content: `${equipment.name} by ${equipment.manufacturer}`,
    },
    {
      property: "og:description",
      content: `Reviews and details for the ${equipment.name} ${equipment.category}`,
    },
    { property: "og:type", content: "product" },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { slug } = params;
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  const db = new DatabaseService(context);

  const equipment = await db.getEquipment(slug);

  if (!equipment) {
    throw redirect("/equipment", { status: 404 });
  }

  const categoryService = createCategoryService(sbServerClient.client);

  const [reviews, usedByPlayers, ratingCategories, generalRatingCategories] = await Promise.all([
    db.getEquipmentReviews(equipment.id, "approved"),
    [], // TODO: Implement getPlayersUsingEquipment when player setups are available
    categoryService.getReviewRatingCategories(equipment.subcategory),
    categoryService.getReviewRatingCategories(), // General categories without parent
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

  return data(
    {
      user: userResponse?.data?.user || null,
      equipment,
      reviews,
      usedByPlayers,
      averageRating,
      reviewCount: reviews.length,
      ratingCategories: allRatingCategories,
    },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentDetail({ loaderData }: Route.ComponentProps) {
  const {
    user,
    equipment,
    reviews,
    usedByPlayers,
    averageRating,
    reviewCount,
    ratingCategories,
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

      <RelatedEquipmentSection category={equipment.category} />
    </>
  );
}

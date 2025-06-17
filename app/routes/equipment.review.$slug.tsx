import type { Route } from "./+types/equipment.review.$slug";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { handleImageUpload } from "~/lib/image-upload.server";
import { sanitizeReviewText } from "~/lib/sanitize";
import { generateCSRFToken, getSessionId } from "~/lib/csrf.server";
import { validateCSRF, createCSRFFailureResponse } from "~/lib/security.server";
import { DiscordService } from "~/lib/discord.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { EquipmentReviewForm } from "~/components/equipment/EquipmentReviewForm";

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
    { title: `Review ${equipment.name} by ${equipment.manufacturer} | TT Reviews` },
    {
      name: "description",
      content: `Write a detailed review of the ${equipment.name} ${equipment.category} by ${equipment.manufacturer}.`,
    },
    {
      name: "keywords",
      content: `${equipment.name}, ${equipment.manufacturer}, ${equipment.category}, table tennis equipment, review, write review`,
    },
    {
      property: "og:title",
      content: `Review ${equipment.name} by ${equipment.manufacturer}`,
    },
    {
      property: "og:description",
      content: `Share your experience with the ${equipment.name} ${equipment.category}`,
    },
    { property: "og:type", content: "article" },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { slug } = params;
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const db = new DatabaseService(context);
  const equipment = await db.getEquipment(slug);

  if (!equipment) {
    throw redirect("/equipment", { status: 404, headers: sbServerClient.headers });
  }

  // Check if user has already reviewed this equipment
  const existingReview = await db.getUserReviewForEquipment(equipment.id, user.id);
  if (existingReview) {
    throw redirect(`/equipment/${slug}`, { 
      headers: sbServerClient.headers,
      status: 302 
    });
  }

  // Load dynamic rating categories based on equipment type
  const categoryService = createCategoryService(sbServerClient.client);
  const playingStyles = await categoryService.getPlayingStyles();
  
  // Get rating categories based on equipment type
  // For rubbers: use subcategory (inverted, anti, short_pips, etc.)
  // For blades: use main category since subcategory is null
  const categoryKey = equipment.subcategory || equipment.category;
  const ratingCategories = await categoryService.getReviewRatingCategories(categoryKey);
  
  // Also get general rating categories (those without parent_id)
  const generalRatingCategories = await categoryService.getReviewRatingCategories();

  // Generate CSRF token for form protection
  const sessionId = getSessionId(request) || 'anonymous';
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    {
      user,
      equipment,
      playingStyles,
      ratingCategories,
      generalRatingCategories,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Record<string, string>).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { slug } = params;
  
  // Get request correlation ID for logging
  const requestId = request.headers.get('x-correlation-id') || crypto.randomUUID();
  
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Validate CSRF token
  const csrfValidation = await validateCSRF(request, user.id);
  if (!csrfValidation.valid) {
    console.warn(`CSRF validation failed for user ${user.id}:`, csrfValidation.error);
    throw createCSRFFailureResponse(csrfValidation.error);
  }

  const db = new DatabaseService(context);
  const equipment = await db.getEquipment(slug);

  if (!equipment) {
    throw redirect("/equipment", { status: 404, headers: sbServerClient.headers });
  }

  // Check if user has already reviewed this equipment
  const existingReview = await db.getUserReviewForEquipment(equipment.id, user.id);
  if (existingReview) {
    throw redirect(`/equipment/${slug}`, { 
      headers: sbServerClient.headers,
      status: 302 
    });
  }

  const formData = await request.formData();
  const env = context.cloudflare.env as Record<string, string>;

  // Extract form data
  const overallRating = parseInt(formData.get("overall_rating") as string);
  const rawReviewText = formData.get("review_text") as string;
  const playingLevel = formData.get("playing_level") as string;
  const styleOfPlay = formData.get("style_of_play") as string;
  const testingDuration = formData.get("testing_duration") as string;

  // Sanitize review text to prevent XSS attacks
  let reviewText: string | null = null;
  if (rawReviewText) {
    try {
      reviewText = sanitizeReviewText(rawReviewText.trim());
    } catch (error) {
      // If sanitization fails (e.g., text too long), return error
      throw new Response((error as Error).message, { 
        status: 400, 
        headers: sbServerClient.headers 
      });
    }
  }

  // Extract category ratings
  const categoryRatings: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("rating_") && value) {
      const categoryKey = key.replace("rating_", "");
      categoryRatings[categoryKey] = parseInt(value as string);
    }
  }

  // Create review data
  const reviewData = {
    equipment_id: equipment.id,
    user_id: user.id,
    overall_rating: overallRating,
    category_ratings: categoryRatings,
    review_text: reviewText || null,
    reviewer_context: {
      playing_level: playingLevel,
      style_of_play: styleOfPlay,
      testing_duration: testingDuration,
    },
    status: "pending" as const,
  };

  // Insert review
  const { data: review, error } = await sbServerClient.client
    .from("equipment_reviews")
    .insert(reviewData)
    .select()
    .single();

  if (error) {
    console.error("Error inserting review:", error);
    throw new Response("Failed to submit review", { status: 500 });
  }

  // Handle image upload if provided
  if (formData.get("image") && (formData.get("image") as File).size > 0) {
    try {
      await handleImageUpload(
        formData,
        env,
        "reviews",
        review.id,
        "image"
      );
    } catch (error) {
      console.error("Error uploading review image:", error);
      // Don't fail the entire submission for image upload errors
    }
  }

  // Send Discord notification (non-blocking)
  try {
    const notificationData = {
      id: review.id,
      equipment_name: equipment.name,
      overall_rating: overallRating,
      reviewer_name: user.email || "Anonymous",
      equipment_id: equipment.id
    };

    const discordService = new DiscordService(context);
    await discordService.notifyNewReview(notificationData, requestId);
  } catch (error) {
    // Discord notification failure should not block the review submission
    // Error logging is handled by the Discord service
  }

  // Return success response for modal display
  return data(
    { success: true },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentReview({ loaderData }: Route.ComponentProps) {
  const {
    user,
    equipment,
    playingStyles,
    ratingCategories,
    generalRatingCategories,
    csrfToken,
    env,
  } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" },
    { label: equipment.name, href: `/equipment/${equipment.slug}` },
    { label: "Write Review", current: true },
  ];

  return (
    <>
      <PageSection background="white" padding="small">
        <Breadcrumb items={breadcrumbItems} />
      </PageSection>

      <PageSection background="white" padding="medium">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Write a Review
            </h1>
            <p className="text-gray-600">
              Share your experience with the{" "}
              <span className="font-semibold">
                {equipment.name} by {equipment.manufacturer}
              </span>
            </p>
          </div>

          <EquipmentReviewForm
            equipment={equipment}
            playingStyles={playingStyles}
            ratingCategories={ratingCategories}
            generalRatingCategories={generalRatingCategories}
            csrfToken={csrfToken}
            env={env}
          />
        </div>
      </PageSection>
    </>
  );
}
import type { Route } from "./+types/players.submit";
import { getServerClient } from "~/lib/supabase.server";
import { handleImageUpload } from "~/lib/image-upload.server";
import { createCategoryService } from "~/lib/categories.server";
import { DiscordService } from "~/lib/discord.server";
import { redirect, data } from "react-router";

import { lazy, Suspense } from "react";
import { PageSection } from "~/components/layout/PageSection";
import { LoadingState } from "~/components/ui/LoadingState";

// Lazy load the form component for better code splitting
const PlayerSubmissionForm = lazy(() =>
  import("~/components/players/PlayerSubmissionForm").then(module => ({
    default: module.PlayerSubmissionForm,
  }))
);

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Load dynamic categories
  const categoryService = createCategoryService(sbServerClient.client);
  const playingStyles = await categoryService.getPlayingStyles();
  const countries = await categoryService.getCountries();

  // Generate CSRF token for form submission
  const { generateCSRFToken, getSessionId } = await import("~/lib/csrf.server");
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, userResponse.data.user.id);

  return data(
    {
      user: userResponse.data.user,
      playingStyles,
      countries,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  // Import security functions inside server-only action
  const {
    rateLimit,
    RATE_LIMITS,
    createRateLimitResponse,
    validateCSRF,
    createCSRFFailureResponse,
  } = await import("~/lib/security.server");

  // Get request correlation ID for logging
  const requestId =
    request.headers.get("x-correlation-id") || crypto.randomUUID();

  // Apply rate limiting for form submissions
  const rateLimitResult = await rateLimit(
    request,
    RATE_LIMITS.FORM_SUBMISSION,
    context
  );
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.resetTime!);
  }

  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Validate CSRF token
  const csrfValidation = await validateCSRF(request, userResponse.data.user.id);
  if (!csrfValidation.valid) {
    return createCSRFFailureResponse(csrfValidation.error);
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;

  // Validate required fields
  if (!name) {
    return data(
      { error: "Player name is required." },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  // Build player submission data
  const submission: any = {
    user_id: userResponse.data.user.id,
    name: name.trim(),
    highest_rating: formData.get("highest_rating") || null,
    active_years: formData.get("active_years") || null,
    playing_style: formData.get("playing_style") || null,
    birth_country: formData.get("birth_country") || null,
    represents: formData.get("represents") || null,
  };

  // Add equipment setup if included
  const includeEquipment = formData.get("include_equipment") === "true";
  if (includeEquipment) {
    const equipmentSetup: any = {};

    const year = formData.get("year");
    if (year) equipmentSetup.year = parseInt(year as string);

    const bladeValue = formData.get("blade_name");
    if (bladeValue) equipmentSetup.blade_name = bladeValue;

    const forehandRubber = formData.get("forehand_rubber_name");
    if (forehandRubber) {
      equipmentSetup.forehand_rubber_name = forehandRubber;
      equipmentSetup.forehand_thickness =
        formData.get("forehand_thickness") || null;
      equipmentSetup.forehand_side = formData.get("forehand_side") || null;
    }

    const backhandRubber = formData.get("backhand_rubber_name");
    if (backhandRubber) {
      equipmentSetup.backhand_rubber_name = backhandRubber;
      equipmentSetup.backhand_thickness =
        formData.get("backhand_thickness") || null;
      equipmentSetup.backhand_side = formData.get("backhand_side") || null;
    }

    const sourceType = formData.get("source_type");
    if (sourceType) equipmentSetup.source_type = sourceType;

    const sourceUrl = formData.get("source_url");
    if (sourceUrl) equipmentSetup.source_url = sourceUrl;

    if (Object.keys(equipmentSetup).length > 0) {
      submission.equipment_setup = equipmentSetup;
    }
  }

  // Use authenticated client with RLS policies
  const supabase = sbServerClient.client;
  const { data: playerSubmission, error: submitError } = await supabase
    .from("player_submissions")
    .insert(submission)
    .select()
    .single();

  if (submitError) {
    console.error("Player submission error:", submitError);
    return data(
      { error: "Failed to submit player. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  // Handle image upload if provided
  let imageUrl = null;
  const env = context.cloudflare.env as Cloudflare.Env;
  const imageUploadResult = await handleImageUpload(
    formData,
    env,
    "player",
    playerSubmission.id,
    "image"
  );

  if (imageUploadResult.success && imageUploadResult.url) {
    imageUrl = imageUploadResult.url;

    // Update submission with image URL
    const { error: updateError } = await supabase
      .from("player_submissions")
      .update({
        image_url: imageUrl,
        image_key: imageUploadResult.key,
      })
      .eq("id", playerSubmission.id);

    if (updateError) {
      // Continue anyway - the submission was created successfully
    }
  } else if (formData.get("image") && !imageUploadResult.success) {
    // If user tried to upload an image but it failed, return error
    return data(
      {
        error:
          imageUploadResult.error ||
          "Failed to upload image. Please try again.",
      },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  // Send Discord notification (non-blocking)
  try {
    const notificationData = {
      id: playerSubmission.id,
      name: playerSubmission.name,
      highest_rating: playerSubmission.highest_rating,
      playing_style: playerSubmission.playing_style,
      represents: playerSubmission.represents,
      active_years: playerSubmission.active_years,
      submitter_email: userResponse.data.user.email || "Anonymous",
    };

    const discordService = new DiscordService(context);
    await discordService.notifyNewPlayerSubmission(notificationData, requestId);
  } catch (error) {
    // Discord notification failure should not block the submission
    // Error logging is handled by the Discord service
  }

  return data(
    {
      success: true,
      message:
        "Player submitted successfully! It will be reviewed by our team.",
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayersSubmit({ loaderData }: Route.ComponentProps) {
  const { user, env, playingStyles, countries, csrfToken } = loaderData;

  return (
    <PageSection background="white" padding="medium">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Submit New Player
          </h1>
          <p className="text-lg text-gray-600">
            Help expand our player database by submitting professional table
            tennis players.
          </p>
        </div>

        <Suspense
          fallback={<LoadingState message="Loading submission form..." />}
        >
          <PlayerSubmissionForm
            playingStyles={playingStyles}
            countries={countries}
            csrfToken={csrfToken}
          />
        </Suspense>
      </div>
    </PageSection>
  );
}

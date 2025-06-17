import type { Route } from "./+types/equipment.submit";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { handleImageUpload } from "~/lib/image-upload.server";
import { createCategoryService } from "~/lib/categories.server";
import { DiscordService } from "~/lib/discord.server";
import { redirect, data } from "react-router";

import { lazy, Suspense } from "react";
import { PageSection } from "~/components/layout/PageSection";
import { LoadingState } from "~/components/ui/LoadingState";

// Lazy load the form component for better code splitting
const EquipmentSubmissionForm = lazy(() =>
  import("~/components/equipment/EquipmentSubmissionForm").then(module => ({
    default: module.EquipmentSubmissionForm,
  }))
);

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Load dynamic categories
  const categoryService = createCategoryService(sbServerClient.client);
  const equipmentCategories = await categoryService.getEquipmentCategories();

  // Generate CSRF token for form submission
  const { generateCSRFToken, getSessionId } = await import("~/lib/csrf.server");
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    {
      user,
      equipmentCategories,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env).SUPABASE_ANON_KEY!,
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
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Validate CSRF token
  const csrfValidation = await validateCSRF(request, user.id);
  if (!csrfValidation.valid) {
    return createCSRFFailureResponse(csrfValidation.error);
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const manufacturer = formData.get("manufacturer") as string;
  const category = formData.get("category") as string;
  const subcategory = formData.get("subcategory") as string;
  const specificationsText = formData.get("specifications") as string;

  // Validate required fields
  if (!name || !manufacturer || !category) {
    return data(
      { error: "Please fill in all required fields." },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  // Parse specifications as JSON if provided
  let specifications = {};
  if (specificationsText.trim()) {
    try {
      specifications = JSON.parse(specificationsText);
    } catch {
      specifications = { description: specificationsText.trim() };
    }
  }

  // Use authenticated client with RLS policies
  const supabase = sbServerClient.client;
  const { data: submission, error: submitError } = await supabase
    .from("equipment_submissions")
    .insert({
      user_id: user.id,
      name: name.trim(),
      manufacturer: manufacturer.trim(),
      category: category as "blade" | "rubber" | "ball",
      subcategory: subcategory || null,
      specifications,
      status: "pending",
    })
    .select()
    .single();

  if (submitError) {
    console.error("Submission error:", submitError);
    return data(
      { error: "Failed to submit equipment. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  // Handle image upload if provided
  let imageUrl = null;
  const env = context.cloudflare.env as Cloudflare.Env;
  const imageUploadResult = await handleImageUpload(
    formData,
    env,
    "equipment",
    submission.id,
    "image"
  );

  if (imageUploadResult.success && imageUploadResult.url) {
    imageUrl = imageUploadResult.url;

    // Update submission with image URL
    const { error: updateError } = await supabase
      .from("equipment_submissions")
      .update({
        specifications: {
          ...specifications,
          image_url: imageUrl,
          image_key: imageUploadResult.key,
        },
      })
      .eq("id", submission.id);

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
      id: submission.id,
      name: submission.name,
      manufacturer: submission.manufacturer,
      category: submission.category,
      subcategory: submission.subcategory,
      submitter_email: user.email,
    };

    const discordService = new DiscordService(context);
    await discordService.notifyNewEquipmentSubmission(
      notificationData,
      requestId
    );
  } catch (error) {
    // Discord notification failure should not block the submission
    // Error logging is handled by the Discord service
  }

  return data(
    {
      success: true,
      message:
        "Equipment submitted successfully! It will be reviewed by our team.",
    },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentSubmit({ loaderData }: Route.ComponentProps) {
  const { user, equipmentCategories, csrfToken, env } = loaderData;

  return (
    <PageSection background="white" padding="medium">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Submit New Equipment
          </h1>
          <p className="text-lg text-gray-600">
            Help expand our equipment database by submitting new table tennis
            equipment.
          </p>
        </div>

        <Suspense
          fallback={<LoadingState message="Loading submission form..." />}
        >
          <EquipmentSubmissionForm
            categories={equipmentCategories}
            csrfToken={csrfToken}
            env={env}
          />
        </Suspense>
      </div>
    </PageSection>
  );
}

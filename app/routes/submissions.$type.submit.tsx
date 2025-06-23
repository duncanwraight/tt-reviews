import type { Route } from "./+types/submissions.$type.submit";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { rateLimit, RATE_LIMITS, createSecureResponse } from "~/lib/security.server";
import { validateCSRF, createCSRFFailureResponse } from "~/lib/security.server";
import { DiscordService } from "~/lib/discord.server";
import { UnifiedSubmissionForm } from "~/components/forms/UnifiedSubmissionForm";
import { getSubmissionConfig, getAllSubmissionTypes } from "~/lib/submissions/registry";
import { loadFieldOptions, handlePreSelections } from "~/lib/submissions/field-loaders.server";
import type { SubmissionType } from "~/lib/types";
import { PageLayout } from "~/components/layout/PageLayout";

export function meta({ params }: Route.MetaArgs) {
  const submissionType = params.type as SubmissionType;
  
  try {
    const config = getSubmissionConfig(submissionType);
    const title = `${config.form.title} | TT Reviews`;
    const description = config.form.description;
    
    return [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex, nofollow" },
    ];
  } catch {
    return [
      { title: "Submission | TT Reviews" },
      { name: "description", content: "Submit content to TT Reviews" },
    ];
  }
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  // Validate submission type
  const submissionType = params.type as SubmissionType;
  const validTypes = getAllSubmissionTypes();
  
  if (!validTypes.includes(submissionType)) {
    throw new Response("Invalid submission type", { status: 404 });
  }

  // Check rate limiting
  const rateLimitResult = await rateLimit(request, RATE_LIMITS.FORM_SUBMISSION);
  if (!rateLimitResult.success) {
    throw new Response("Too many requests", { status: 429 });
  }

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const config = getSubmissionConfig(submissionType);

  // Handle pre-selections from URL parameters first (needed for equipment ID)
  const url = new URL(request.url);
  const initialPreSelections = await handlePreSelections(submissionType, url, {}, sbServerClient.client);

  // Load field options using unified system, passing equipment ID for reviews
  const additionalData = submissionType === "review" && initialPreSelections.equipment_id 
    ? { equipmentId: initialPreSelections.equipment_id } 
    : undefined;
  const fieldOptions = await loadFieldOptions(submissionType, sbServerClient.client, additionalData);

  // Get final pre-selections with loaded field options
  const preSelectedValues = await handlePreSelections(submissionType, url, fieldOptions, sbServerClient.client);

  // Generate CSRF token
  const { generateCSRFToken, getSessionId } = await import("~/lib/csrf.server");
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    {
      user,
      config,
      fieldOptions,
      preSelectedValues,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as unknown as Record<string, string>).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as unknown as Record<string, string>).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const submissionType = params.type as SubmissionType;
  const validTypes = getAllSubmissionTypes();
  
  if (!validTypes.includes(submissionType)) {
    throw new Response("Invalid submission type", { status: 404 });
  }

  // Check rate limiting
  const rateLimitResult = await rateLimit(request, RATE_LIMITS.FORM_SUBMISSION);
  if (!rateLimitResult.success) {
    return createSecureResponse(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, isApi: true }
    );
  }

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Validate CSRF
  const csrfValidation = await validateCSRF(request, user.id);
  if (!csrfValidation.valid) {
    return createCSRFFailureResponse(csrfValidation.error);
  }

  const formData = await request.formData();
  const config = getSubmissionConfig(submissionType);

  // Get equipment_id from URL params for review submissions
  const url = new URL(request.url);
  const initialPreSelections = await handlePreSelections(submissionType, url, {}, sbServerClient.client);

  try {
    // Parse form data based on submission type
    const submissionData: any = {
      user_id: user.id,
      status: "pending",
    };

    // Add equipment_id for review submissions
    if (submissionType === "review" && initialPreSelections.equipment_id) {
      submissionData.equipment_id = initialPreSelections.equipment_id;
    }

    // Extract form fields based on configuration
    for (const field of config.form.fields) {
      const value = formData.get(field.name);
      if (value !== null && value !== "") {
        // Handle specifications as JSON for equipment submissions
        if (field.name === "specifications" && submissionType === "equipment") {
          submissionData[field.name] = { notes: value };
        } 
        // Skip rating_categories field - handled separately below
        else if (field.name === "rating_categories" && submissionType === "review") {
          // Will be processed below in review-specific section
          continue;
        }
        // Skip playing_level and experience_duration for reviews - they go into reviewer_context
        else if ((field.name === "playing_level" || field.name === "experience_duration") && submissionType === "review") {
          // Will be processed below in review-specific section
          continue;
        }
        else {
          submissionData[field.name] = value;
        }
      }
    }

    // Handle review-specific data transformation
    if (submissionType === "review") {
      // Parse rating categories from JSON string and map to correct field name
      const ratingCategoriesRaw = formData.get("rating_categories");
      if (ratingCategoriesRaw && ratingCategoriesRaw !== "") {
        try {
          submissionData.category_ratings = JSON.parse(ratingCategoriesRaw as string);
        } catch (error) {
          console.error("Error parsing rating categories:", error);
          submissionData.category_ratings = {};
        }
      }
      
      // Get overall rating
      const overallRating = formData.get("overall_rating");
      if (overallRating && overallRating !== "") {
        submissionData.overall_rating = parseFloat(overallRating as string);
      }
      
      // Build reviewer context from playing_level and experience_duration
      const reviewerContext: any = {};
      const playingLevel = formData.get("playing_level");
      const experienceDuration = formData.get("experience_duration");
      
      if (playingLevel && playingLevel !== "") {
        reviewerContext.playing_level = playingLevel;
      }
      if (experienceDuration && experienceDuration !== "") {
        reviewerContext.experience_duration = experienceDuration;
      }
      
      if (Object.keys(reviewerContext).length > 0) {
        submissionData.reviewer_context = reviewerContext;
      }
    }

    // Note: submitter_email is not stored in database, but used for Discord notifications

    // Insert into appropriate table using admin client
    const { createSupabaseAdminClient } = await import("~/lib/database.server");
    const adminClient = createSupabaseAdminClient(context);
    
    const { data: submission, error: submitError } = await adminClient
      .from(config.tableName)
      .insert(submissionData)
      .select()
      .single();

    if (submitError) {
      console.error("Database submission error:", submitError);
      return data(
        { error: "Failed to submit. Please try again." },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Send Discord notification using unified system
    const requestId = request.headers.get("X-Request-ID") || "unknown";
    try {
      const discordService = new DiscordService(context);
      
      // For reviews, fetch equipment name for Discord notification
      let notificationData = { ...submission, submitter_email: user.email };
      if (submissionType === "review" && submission.equipment_id) {
        const { data: equipment } = await adminClient
          .from("equipment")
          .select("name")
          .eq("id", submission.equipment_id)
          .single();
        
        if (equipment) {
          notificationData.equipment_name = equipment.name;
        }
      }
      
      await discordService.notifySubmission(
        submissionType,
        notificationData,
        requestId
      );
    } catch (error) {
      // Discord notification failure should not block the submission
      // Error is already logged by the Discord service
    }

    return data(
      {
        success: true,
        message: config.form.successMessage,
      },
      { headers: sbServerClient.headers }
    );
  } catch (error) {
    console.error("Submission processing error:", error);
    return data(
      { error: "Failed to submit. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function UnifiedSubmissionRoute({ loaderData }: Route.ComponentProps) {
  const { user, config, fieldOptions, preSelectedValues, csrfToken, env } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Submit", href: "#" },
    { label: config.displayName, current: true },
  ];

  return (
    <PageLayout user={user}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4">
          <nav className="flex" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-3">
              {breadcrumbItems.map((item, index) => (
                <li key={index} className="inline-flex items-center">
                  {index > 0 && (
                    <svg
                      className="w-6 h-6 text-gray-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {item.href && !item.current ? (
                    <a
                      href={item.href}
                      className="text-sm font-medium text-gray-700 hover:text-purple-600"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-500">
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <UnifiedSubmissionForm
          config={config}
          fieldOptions={fieldOptions}
          preSelectedValues={preSelectedValues}
          csrfToken={csrfToken}
          env={env}
        />
      </div>
    </PageLayout>
  );
}
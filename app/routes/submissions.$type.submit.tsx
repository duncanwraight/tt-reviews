import type { Route } from "./+types/submissions.$type.submit";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import {
  rateLimit,
  RATE_LIMITS,
  createSecureResponse,
} from "~/lib/security.server";
import { validateCSRF, createCSRFFailureResponse } from "~/lib/security.server";
import { DiscordService } from "~/lib/discord.server";
import { UnifiedSubmissionForm } from "~/components/forms/UnifiedSubmissionForm";
import {
  getSubmissionConfig,
  getAllSubmissionTypes,
} from "~/lib/submissions/registry";
import {
  loadFieldOptions,
  handlePreSelections,
  loadAllEquipmentSpecFields,
} from "~/lib/submissions/field-loaders.server";
import { enrichSubmissionForNotification } from "~/lib/submissions/enrichment.server";
import {
  validateSubmission,
  parseEquipmentSpecs,
} from "~/lib/submissions/validate.server";
import type { SubmissionType } from "~/lib/types";
import { PageLayout } from "~/components/layout/PageLayout";
import { Logger, createLogContext } from "~/lib/logger.server";

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

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Check rate limiting (skip for admins)
  if (user.role !== "admin") {
    const rateLimitResult = await rateLimit(
      request,
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    if (!rateLimitResult.success) {
      throw new Response("Too many requests", { status: 429 });
    }
  }

  const config = getSubmissionConfig(submissionType);

  // Handle pre-selections from URL parameters first (needed for equipment ID)
  const url = new URL(request.url);
  const initialPreSelections = await handlePreSelections(
    submissionType,
    url,
    {},
    sbServerClient.client
  );

  // Load field options using unified system, passing equipment ID for reviews
  const additionalData =
    submissionType === "review" && initialPreSelections.equipment_id
      ? { equipmentId: initialPreSelections.equipment_id }
      : undefined;
  const fieldOptions = await loadFieldOptions(
    submissionType,
    sbServerClient.client,
    additionalData
  );

  // Get final pre-selections with loaded field options
  const preSelectedValues = await handlePreSelections(
    submissionType,
    url,
    fieldOptions,
    sbServerClient.client
  );

  // Generate CSRF token
  const { issueCSRFToken } = await import("~/lib/security.server");
  const csrfToken = await issueCSRFToken(request, context, user.id);

  return data(
    {
      user,
      config,
      fieldOptions,
      preSelectedValues,
      csrfToken,
      env: {
        SUPABASE_URL: (
          context.cloudflare.env as unknown as Record<string, string>
        ).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (
          context.cloudflare.env as unknown as Record<string, string>
        ).SUPABASE_ANON_KEY!,
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

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Check rate limiting (skip for admins)
  if (user.role !== "admin") {
    const rateLimitResult = await rateLimit(
      request,
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    if (!rateLimitResult.success) {
      return createSecureResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, isApi: true, context }
      );
    }
  }

  // Validate CSRF
  const csrfValidation = await validateCSRF(request, context, user.id);
  if (!csrfValidation.valid) {
    return createCSRFFailureResponse(context, csrfValidation.error);
  }

  const formData = await request.formData();
  const config = getSubmissionConfig(submissionType);

  // For review submissions the equipment_id comes from the URL, not the
  // form — stitch it in before validation so the required-field check
  // passes on a legitimate submission.
  const url = new URL(request.url);
  const initialPreSelections = await handlePreSelections(
    submissionType,
    url,
    {},
    sbServerClient.client
  );
  if (
    submissionType === "review" &&
    initialPreSelections.equipment_id &&
    !formData.has("equipment_id")
  ) {
    formData.set("equipment_id", initialPreSelections.equipment_id);
  }

  const fieldValidation = validateSubmission(submissionType, formData);
  // Equipment submissions also carry typed `spec_*` fields validated/parsed
  // separately — merge any errors into one response so the form surfaces
  // them all at once.
  let parsedSpecs: ReturnType<typeof parseEquipmentSpecs> | null = null;
  if (submissionType === "equipment" || submissionType === "equipment_edit") {
    const specFields = await loadAllEquipmentSpecFields(sbServerClient.client);
    parsedSpecs = parseEquipmentSpecs(formData, specFields);
  }
  const mergedErrors: Record<string, string> = {
    ...(fieldValidation.errors || {}),
    ...(parsedSpecs?.errors || {}),
  };
  if (Object.keys(mergedErrors).length > 0) {
    return data(
      {
        error: "Submission is invalid. Please check the highlighted fields.",
        fieldErrors: mergedErrors,
      },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  try {
    // Parse form data based on submission type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // equipment_specs is parsed by parseEquipmentSpecs above into typed
      // JSONB; skip the loop's value lookup (the input names are spec_*,
      // not "specifications").
      if (field.type === "equipment_specs") {
        continue;
      }
      const value = formData.get(field.name);
      if (value !== null && value !== "") {
        // Skip image fields - handled separately below with R2 upload
        if (field.type === "image") {
          continue;
        }
        // Skip rating_categories field - handled separately below
        else if (
          field.name === "rating_categories" &&
          submissionType === "review"
        ) {
          // Will be processed below in review-specific section
          continue;
        }
        // Skip playing_level and experience_duration for reviews - they go into reviewer_context
        else if (
          (field.name === "playing_level" ||
            field.name === "experience_duration") &&
          submissionType === "review"
        ) {
          // Will be processed below in review-specific section
          continue;
        } else {
          submissionData[field.name] = value;
        }
      }
    }

    // Equipment: assign typed specifications JSONB built by parseEquipmentSpecs.
    // Always assign (default {}) so the column is non-null for the trigger /
    // approval-copy step that lifts this onto the equipment row.
    if (submissionType === "equipment") {
      submissionData.specifications = parsedSpecs?.specifications || {};
    }

    // Handle player_equipment_setup - extract individual fields rendered by the component
    if (submissionType === "player_equipment_setup") {
      const equipmentFields = [
        "year",
        "blade_id",
        "forehand_rubber_id",
        "forehand_thickness",
        "forehand_side",
        "backhand_rubber_id",
        "backhand_thickness",
        "backhand_side",
        "source_type",
        "source_url",
      ];

      for (const fieldName of equipmentFields) {
        const value = formData.get(fieldName);
        if (value !== null && value !== "") {
          // Convert year to integer
          if (fieldName === "year") {
            submissionData[fieldName] = parseInt(value as string, 10);
          } else {
            submissionData[fieldName] = value;
          }
        }
      }
    }

    // Handle review-specific data transformation
    if (submissionType === "review") {
      // Parse rating categories from JSON string and map to correct field name
      const ratingCategoriesRaw = formData.get("rating_categories");
      if (ratingCategoriesRaw && ratingCategoriesRaw !== "") {
        try {
          submissionData.category_ratings = JSON.parse(
            ratingCategoriesRaw as string
          );
        } catch (error) {
          Logger.error(
            "Error parsing rating categories",
            createLogContext(
              request.headers.get("X-Request-ID") || "submission-submit",
              {
                route: "/submissions/:type/submit",
                method: request.method,
                userId: user?.id,
                submissionType,
              }
            ),
            error instanceof Error ? error : undefined
          );
          submissionData.category_ratings = {};
        }
      }

      // Get overall rating
      const overallRating = formData.get("overall_rating");
      if (overallRating && overallRating !== "") {
        submissionData.overall_rating = parseFloat(overallRating as string);
      }

      // Build reviewer context from playing_level and experience_duration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Handle equipment_edit - diff against current equipment row and
    // pack edit_data JSONB. The moderation queue (TT-105) re-applies
    // these on approval. Image is staged via the generic image-upload
    // block below; we move the resulting key into edit_data afterwards
    // since equipment_edits has no top-level image_key column.
    if (submissionType === "equipment_edit") {
      const equipmentId = submissionData.equipment_id;
      if (!equipmentId) {
        return data(
          { error: "Missing equipment_id." },
          { status: 400, headers: sbServerClient.headers }
        );
      }

      const { data: current } = await sbServerClient.client
        .from("equipment")
        .select(
          "name, category, subcategory, description, specifications, image_key"
        )
        .eq("id", equipmentId)
        .single();

      if (!current) {
        return data(
          { error: "Equipment not found." },
          { status: 404, headers: sbServerClient.headers }
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editData: Record<string, any> = {};

      // Scalar diffs — only include fields that differ from current.
      for (const fieldName of [
        "name",
        "category",
        "subcategory",
        "description",
      ] as const) {
        const submitted = submissionData[fieldName];
        if (submitted === undefined) continue;
        const submittedValue =
          typeof submitted === "string" && submitted.trim() === ""
            ? null
            : submitted;
        const currentValue =
          (current as Record<string, unknown>)[fieldName] ?? null;
        if (submittedValue !== currentValue) {
          editData[fieldName] = submittedValue;
        }
      }

      // Spec diffs — order-independent compare. Postgres JSONB
      // normalises keys alphabetically on store, so a range value
      // returned from the DB looks like {max,min} while the parser
      // produces {min,max}. JSON.stringify on these gives different
      // strings even though the values are equal — false-positive
      // diffs (TT-105 follow-up). canonicaliseSpec handles range
      // objects explicitly and falls back to string compare for
      // primitives.
      const canonicaliseSpec = (value: unknown): string => {
        if (
          value &&
          typeof value === "object" &&
          "min" in value &&
          "max" in value
        ) {
          const r = value as { min: unknown; max: unknown };
          return JSON.stringify({ min: r.min, max: r.max });
        }
        return JSON.stringify(value);
      };

      const submittedSpecs = (parsedSpecs?.specifications || {}) as Record<
        string,
        unknown
      >;
      const currentSpecs = (current.specifications || {}) as Record<
        string,
        unknown
      >;
      const changedSpecs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(submittedSpecs)) {
        if (canonicaliseSpec(value) !== canonicaliseSpec(currentSpecs[key])) {
          changedSpecs[key] = value;
        }
      }
      // Spec keys present in current but absent from submitted → user
      // cleared the field, mark for removal.
      for (const key of Object.keys(currentSpecs)) {
        if (!(key in submittedSpecs)) {
          changedSpecs[key] = null;
        }
      }
      if (Object.keys(changedSpecs).length > 0) {
        editData.specifications = changedSpecs;
      }

      const imageAction = submissionData.image_action;
      editData.image_action = imageAction;
      if (submissionData.edit_reason) {
        editData.edit_reason = submissionData.edit_reason;
      }

      // Image-action invariants.
      if (imageAction === "keep" && !current.image_key) {
        return data(
          {
            error: "There is no current image — please upload one.",
            fieldErrors: {
              image_action: "Upload required when no image exists yet.",
            },
          },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      if (imageAction === "replace") {
        const file = formData.get("image") as File | null;
        if (!file || file.size === 0) {
          return data(
            {
              error: "Please choose an image to replace the current one.",
              fieldErrors: {
                image: "An image file is required when replacing.",
              },
            },
            { status: 400, headers: sbServerClient.headers }
          );
        }
      }

      // Reject empty edits — image_action and edit_reason alone don't
      // count as a change.
      const meaningfulChange =
        Object.keys(editData).some(
          k => k !== "edit_reason" && k !== "image_action"
        ) || imageAction === "replace";
      if (!meaningfulChange) {
        return data(
          {
            error:
              "No changes detected. Edit at least one field before submitting.",
          },
          { status: 400, headers: sbServerClient.headers }
        );
      }

      // Reshape submissionData to the equipment_edits row schema.
      Object.keys(submissionData).forEach(key => {
        if (key !== "user_id" && key !== "status") {
          delete submissionData[key];
        }
      });
      submissionData.equipment_id = equipmentId;
      submissionData.edit_data = editData;
    }

    // Handle player_edit - transform fields into edit_data JSONB
    if (submissionType === "player_edit") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editData: Record<string, any> = {};
      const editableFields = [
        "name",
        "highest_rating",
        "active_years",
        "playing_style",
        "active",
      ];

      for (const fieldName of editableFields) {
        if (
          submissionData[fieldName] !== undefined &&
          submissionData[fieldName] !== ""
        ) {
          // Convert "true"/"false" strings to booleans for active field
          if (fieldName === "active") {
            editData[fieldName] = submissionData[fieldName] === "true";
          } else {
            editData[fieldName] = submissionData[fieldName];
          }
          delete submissionData[fieldName];
        }
      }

      // Store edit_reason in edit_data as well
      if (submissionData.edit_reason) {
        editData.edit_reason = submissionData.edit_reason;
        delete submissionData.edit_reason;
      }

      // Reject empty edits — edit_reason alone doesn't count as a
      // change, but any actual field edit or a new photo upload does.
      // Mirrors the equipment_edit gate so both edit-style submissions
      // refuse silent no-ops with the same error copy.
      const imageFile = formData.get("image") as File | null;
      const hasImage = Boolean(imageFile && imageFile.size > 0);
      const hasFieldChange = Object.keys(editData).some(
        k => k !== "edit_reason"
      );
      if (!hasFieldChange && !hasImage) {
        return data(
          {
            error:
              "No changes detected. Edit at least one field before submitting.",
          },
          { status: 400, headers: sbServerClient.headers }
        );
      }

      submissionData.edit_data = editData;
    }

    // Note: submitter_email is not stored in database, but used for Discord notifications

    // Handle image upload if present
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      const { validateImageFile, generateImageKey, uploadImageToR2Native } =
        await import("~/lib/r2-native.server");

      const validation = await validateImageFile(imageFile);
      if (
        !validation.valid ||
        !validation.detectedType ||
        !validation.extension
      ) {
        return data(
          { error: validation.error || "Invalid image file" },
          { status: 400, headers: sbServerClient.headers }
        );
      }

      const env = context.cloudflare.env as Cloudflare.Env;
      if (env.IMAGE_BUCKET) {
        try {
          // Use a temporary UUID since we don't have the submission ID yet
          const tempId = crypto.randomUUID();
          const category =
            submissionType === "player" || submissionType === "player_edit"
              ? "player"
              : "equipment";
          const key = generateImageKey(
            category,
            `submission-${tempId}`,
            validation.extension
          );

          await uploadImageToR2Native(
            env.IMAGE_BUCKET,
            key,
            imageFile,
            validation.detectedType,
            {
              submissionType,
              uploadedBy: user.id,
            }
          );

          // equipment_edits has no image_key column; the staged R2
          // key lives inside edit_data so the moderation applier
          // (TT-105) can promote it on approval and clean it up on
          // rejection.
          if (submissionType === "equipment_edit") {
            submissionData.edit_data.image_pending_key = key;
          } else {
            submissionData.image_key = key;
          }
        } catch (uploadError) {
          Logger.error(
            "Image upload error",
            createLogContext(
              request.headers.get("X-Request-ID") || "submission-submit",
              {
                route: "/submissions/:type/submit",
                method: request.method,
                userId: user?.id,
                submissionType,
              }
            ),
            uploadError instanceof Error ? uploadError : undefined
          );
          // Don't fail the submission if image upload fails, just log it
        }
      }
    }

    // Insert into appropriate table using admin client
    const { createSupabaseAdminClient } = await import("~/lib/database.server");
    const adminClient = createSupabaseAdminClient(context);

    const { data: submission, error: submitError } = await adminClient
      .from(config.tableName)
      .insert(submissionData)
      .select()
      .single();

    if (submitError) {
      Logger.error(
        "Database submission error",
        createLogContext(
          request.headers.get("X-Request-ID") || "submission-submit",
          {
            route: "/submissions/:type/submit",
            method: request.method,
            userId: user?.id,
            submissionType,
          }
        ),
        submitError instanceof Error ? submitError : undefined
      );
      return data(
        { error: "Failed to submit. Please try again." },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Send Discord notification using unified system
    const requestId = request.headers.get("X-Request-ID") || "unknown";
    const discordLogContext = createLogContext(requestId, {
      route: "/submissions/:type/submit",
      method: request.method,
      userId: user?.id,
      submissionType,
      submissionId: submission?.id,
    });
    Logger.info("Discord notification starting", discordLogContext);
    try {
      const discordService = new DiscordService(context);

      // Per-type enrichment lives in enrichment.server.ts so new
      // submission types extend a single helper instead of threading a
      // new ad-hoc branch into this action — the pattern that produced
      // the TT-105 follow-up bug.
      const notificationData = await enrichSubmissionForNotification(
        submissionType,
        {
          submission,
          submitterEmail: user.email,
          adminClient,
        }
      );

      const result = await discordService.notifySubmission(
        submissionType,
        notificationData,
        requestId
      );
      Logger.info("Discord notification result", discordLogContext, { result });
    } catch (error) {
      // Discord notification failure should not block the submission
      Logger.error(
        "Discord notification error",
        discordLogContext,
        error instanceof Error ? error : undefined
      );
    }

    return data(
      {
        success: true,
        message: config.form.successMessage,
      },
      { headers: sbServerClient.headers }
    );
  } catch (error) {
    Logger.error(
      "Submission processing error",
      createLogContext(
        request.headers.get("X-Request-ID") || "submission-submit",
        {
          route: "/submissions/:type/submit",
          method: request.method,
        }
      ),
      error instanceof Error ? error : undefined
    );
    return data(
      { error: "Failed to submit. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function UnifiedSubmissionRoute({
  loaderData,
}: Route.ComponentProps) {
  const { user, config, fieldOptions, preSelectedValues, csrfToken, env } =
    loaderData;

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

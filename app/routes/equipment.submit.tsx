import type { Route } from "./+types/equipment.submit";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { handleImageUpload } from "~/lib/image-upload.server";
import { createCategoryService } from "~/lib/categories.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { EquipmentSubmissionForm } from "~/components/equipment/EquipmentSubmissionForm";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Load dynamic categories
  const categoryService = createCategoryService(sbServerClient.client);
  const equipmentCategories = await categoryService.getEquipmentCategories();

  return data(
    {
      user,
      equipmentCategories,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Record<string, string>).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
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
        }
      })
      .eq("id", submission.id);

    if (updateError) {
      // Continue anyway - the submission was created successfully
    }
  } else if (formData.get("image") && !imageUploadResult.success) {
    // If user tried to upload an image but it failed, return error
    return data(
      { error: imageUploadResult.error || "Failed to upload image. Please try again." },
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

    // Get environment variables
    const env = context.cloudflare.env as Cloudflare.Env;
    
    // Use direct Discord webhook (avoiding worker-to-worker call)
    if (env.DISCORD_WEBHOOK_URL) {
      
      const embed = {
        title: "⚙️ Equipment Submission",
        description: "A new equipment submission has been received and needs moderation.",
        color: 0x9b59b6, // Purple color
        fields: [
          {
            name: "Equipment Name",
            value: notificationData.name || "Unknown Equipment",
            inline: true,
          },
          {
            name: "Manufacturer", 
            value: notificationData.manufacturer || "Unknown",
            inline: true,
          },
          {
            name: "Category",
            value: notificationData.category
              ? notificationData.category.charAt(0).toUpperCase() + notificationData.category.slice(1)
              : "Unknown",
            inline: true,
          },
          {
            name: "Subcategory",
            value: notificationData.subcategory || "N/A",
            inline: true,
          },
          {
            name: "Submitted by",
            value: notificationData.submitter_email || "Anonymous",
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const components = [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 3, // Success/Green
              label: "Approve Equipment",
              custom_id: `approve_equipment_${notificationData.id}`,
            },
            {
              type: 2, // Button
              style: 4, // Danger/Red
              label: "Reject Equipment", 
              custom_id: `reject_equipment_${notificationData.id}`,
            },
          ],
        },
      ];

      const payload = {
        embeds: [embed],
        components,
      };
      
      const directResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!directResponse.ok) {
        const directErrorText = await directResponse.text();
        console.error("Direct Discord error:", directErrorText);
      }
    }
    
  } catch (error) {
    console.error("Discord notification failed:", error);
  }

  return data(
    { success: true, message: "Equipment submitted successfully! It will be reviewed by our team." },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentSubmit({ loaderData }: Route.ComponentProps) {
  const { user, equipmentCategories, env } = loaderData;

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

        <EquipmentSubmissionForm categories={equipmentCategories} env={env} />
      </div>
    </PageSection>
  );
}

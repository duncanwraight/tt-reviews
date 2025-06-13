import type { Route } from "./+types/equipment.submit";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { EquipmentSubmissionForm } from "~/components/equipment/EquipmentSubmissionForm";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  return data(
    {
      user,
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

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

  // Send Discord notification (non-blocking)
  try {
    console.log("Starting Discord notification...");
    
    const notificationData = {
      id: submission.id,
      name: submission.name,
      manufacturer: submission.manufacturer,
      category: submission.category,
      subcategory: submission.subcategory,
      submitter_email: user.email,
    };

    console.log("Notification data:", notificationData);

    // Get environment variables
    const env = context.cloudflare.env as Cloudflare.Env;
    const baseUrl = env.SITE_URL || `https://${request.headers.get("host")}`;
    
    console.log("Base URL:", baseUrl);
    console.log("Environment check - DISCORD_WEBHOOK_URL exists:", !!env.DISCORD_WEBHOOK_URL);
    
    // Skip internal API call - use direct Discord webhook instead
    console.log("=== Using direct Discord webhook (avoiding worker-to-worker call) ===");

    // Call Discord webhook directly with full notification structure
    if (env.DISCORD_WEBHOOK_URL) {
      console.log("Calling Discord webhook directly with full notification...");
      
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

      console.log("Direct Discord response status:", directResponse.status);
      console.log("Direct Discord response ok:", directResponse.ok);
      
      if (!directResponse.ok) {
        const directErrorText = await directResponse.text();
        console.error("Direct Discord error:", directErrorText);
      } else {
        console.log("Discord notification sent successfully!");
      }
    } else {
      console.error("DISCORD_WEBHOOK_URL not available");
    }
    
  } catch (error) {
    console.error("Discord notification failed:", error);
    console.error("Error details:", error instanceof Error ? error.message : "Unknown error");
  }

  return data(
    { success: true, message: "Equipment submitted successfully! It will be reviewed by our team." },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentSubmit({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

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

        <EquipmentSubmissionForm />
      </div>
    </PageSection>
  );
}

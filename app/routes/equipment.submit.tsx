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
    const notificationData = {
      id: submission.id,
      name: submission.name,
      manufacturer: submission.manufacturer,
      category: submission.category,
      subcategory: submission.subcategory,
      submitter_email: user.email,
    };

    // Make internal API call to Discord notification endpoint
    const env = context.cloudflare.env as Cloudflare.Env;
    const baseUrl = env.SITE_URL || `https://${request.headers.get("host")}`;
    
    fetch(`${baseUrl}/api/discord/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "new_equipment_submission",
        data: notificationData,
      }),
    }).catch((error) => {
      console.error("Discord notification failed:", error);
      // Don't fail the submission if Discord notification fails
    });
  } catch (error) {
    console.error("Discord notification setup failed:", error);
    // Don't fail the submission if Discord notification setup fails
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

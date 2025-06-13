import type { Route } from "./+types/equipment.submit";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { createSupabaseAdminClient } from "~/lib/database.server";
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

  // Use service role client to bypass RLS issues
  const supabase = createSupabaseAdminClient(context);
  const { error: submitError } = await supabase
    .from("equipment_submissions")
    .insert({
      user_id: user.id,
      name: name.trim(),
      manufacturer: manufacturer.trim(),
      category: category as "blade" | "rubber" | "ball",
      subcategory: subcategory || null,
      specifications,
      status: "pending",
    });

  if (submitError) {
    console.error("Submission error:", submitError);
    return data(
      { error: "Failed to submit equipment. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  return redirect("/equipment", { headers: sbServerClient.headers });
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

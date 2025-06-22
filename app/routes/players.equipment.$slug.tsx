import type { Route } from "./+types/players.equipment.$slug";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { DatabaseService } from "~/lib/database.server";
import { generateCSRFToken, getSessionId } from "~/lib/csrf.server";
import { validateCSRF, createCSRFFailureResponse } from "~/lib/security.server";
import { DiscordService } from "~/lib/discord.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayerEquipmentSetupForm } from "~/components/players/PlayerEquipmentSetupForm";

export function meta({ data }: Route.MetaArgs) {
  if (!data?.player) {
    return [
      { title: "Player Not Found | TT Reviews" },
      {
        name: "description",
        content: "The requested player could not be found.",
      },
    ];
  }

  const { player } = data;
  return [
    {
      title: `Add Equipment Setup for ${player.name} | TT Reviews`,
    },
    {
      name: "description",
      content: `Add equipment setup information for ${player.name}.`,
    },
    {
      name: "keywords",
      content: `${player.name}, table tennis equipment, player setup, blade, rubber`,
    },
    {
      property: "og:title",
      content: `Add Equipment Setup for ${player.name}`,
    },
    {
      property: "og:description",
      content: `Submit equipment setup information for ${player.name}`,
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
  const player = await db.getPlayer(slug);

  if (!player) {
    throw redirect("/players", {
      status: 404,
      headers: sbServerClient.headers,
    });
  }

  // Load equipment data
  const blades = await db.getEquipmentByCategory("blade");
  const rubbers = await db.getEquipmentByCategory("rubber");

  // Generate CSRF token for form protection
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    {
      user,
      player,
      blades,
      rubbers,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { slug } = params;

  // Get request correlation ID for logging
  const requestId =
    request.headers.get("x-correlation-id") || crypto.randomUUID();

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Validate CSRF token
  const csrfValidation = await validateCSRF(request, user.id);
  if (!csrfValidation.valid) {
    console.warn(
      `CSRF validation failed for user ${user.id}:`,
      csrfValidation.error
    );
    throw createCSRFFailureResponse(csrfValidation.error);
  }

  const db = new DatabaseService(context);
  const player = await db.getPlayer(slug);

  if (!player) {
    throw redirect("/players", {
      status: 404,
      headers: sbServerClient.headers,
    });
  }

  const formData = await request.formData();

  // Extract equipment setup data
  const year = formData.get("year") as string;
  const bladeId = formData.get("blade_id") as string;
  const forehandRubberId = formData.get("forehand_rubber_id") as string;
  const backhandRubberId = formData.get("backhand_rubber_id") as string;
  const forehandThickness = formData.get("forehand_thickness") as string;
  const backhandThickness = formData.get("backhand_thickness") as string;
  const forehandColor = formData.get("forehand_color") as string;
  const backhandColor = formData.get("backhand_color") as string;
  const sourceUrl = formData.get("source_url") as string;
  const sourceType = formData.get("source_type") as string;

  // Validate required fields
  if (!year || !bladeId) {
    return data(
      {
        success: false,
        error: "Year and blade are required fields.",
      },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  // Create equipment setup data
  const equipmentSetupData = {
    player_id: player.id,
    year: parseInt(year),
    blade_id: bladeId || null,
    forehand_rubber_id: forehandRubberId || null,
    backhand_rubber_id: backhandRubberId || null,
    forehand_thickness: forehandThickness || null,
    backhand_thickness: backhandThickness || null,
    forehand_color: forehandColor || null,
    backhand_color: backhandColor || null,
    source_url: sourceUrl || null,
    source_type: sourceType || null,
    verified: false,
  };

  // Insert equipment setup using admin client to bypass RLS
  const { createSupabaseAdminClient } = await import("~/lib/database.server");
  const adminClient = createSupabaseAdminClient(context);
  const { data: equipmentSetup, error } = await adminClient
    .from("player_equipment_setups")
    .insert(equipmentSetupData)
    .select()
    .single();

  if (error) {
    console.error("Error inserting equipment setup:", error);
    return data(
      {
        success: false,
        error: "Failed to submit equipment setup. Please try again.",
      },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  // Send Discord notification (non-blocking)
  try {
    const notificationData = {
      id: equipmentSetup.id,
      player_name: player.name,
      player_id: player.id,
      year: parseInt(year),
      submitter_email: user.email || "Anonymous",
    };

    const discordService = new DiscordService(context);
    await discordService.notifyNewPlayerEquipmentSetup(notificationData, requestId);
  } catch (error) {
    // Discord notification failure should not block the equipment setup submission
    // Error logging is handled by the Discord service
  }

  // Return success response for modal display
  return data({ success: true }, { headers: sbServerClient.headers });
}

export default function PlayerEquipmentSetup({ loaderData }: Route.ComponentProps) {
  const {
    user,
    player,
    blades,
    rubbers,
    csrfToken,
    env,
  } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
    { label: "Add Equipment Setup", current: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageSection background="white" padding="small">
        <Breadcrumb items={breadcrumbItems} />
      </PageSection>

      <PageSection background="white" padding="medium">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Add Equipment Setup
            </h1>
            <p className="text-gray-600">
              Add equipment setup information for{" "}
              <span className="font-semibold">{player.name}</span>
            </p>
          </div>

          <PlayerEquipmentSetupForm
            player={player}
            blades={blades}
            rubbers={rubbers}
            csrfToken={csrfToken}
            env={env}
          />
        </div>
      </PageSection>
    </div>
  );
}
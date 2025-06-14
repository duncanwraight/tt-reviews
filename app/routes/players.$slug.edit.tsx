import type { Route } from "./+types/players.$slug.edit";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayerEditForm } from "~/components/players/PlayerEditForm";

export function meta({ params, data }: Route.MetaArgs) {
  const player = data?.player;
  if (!player) {
    return [
      { title: "Player Not Found | TT Reviews" },
      { name: "description", content: "Player not found" },
    ];
  }

  return [
    { title: `Edit ${player.name} | TT Reviews` },
    {
      name: "description",
      content: `Update ${player.name}'s profile information and equipment details.`,
    },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const db = new DatabaseService(context);
  const player = await db.getPlayer(params.slug);

  if (!player) {
    throw redirect("/players");
  }

  // Load dynamic categories
  const categoryService = createCategoryService(sbServerClient.client);
  const playingStyles = await categoryService.getPlayingStyles();
  const countries = await categoryService.getCountries();

  return data(
    {
      user: userResponse.data.user,
      player,
      playingStyles,
      countries,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const db = new DatabaseService(context);
  const player = await db.getPlayer(params.slug);

  if (!player) {
    throw redirect("/players");
  }

  const formData = await request.formData();
  
  // Build edit data with only changed fields
  const editData: any = {};

  const name = formData.get("name") as string;
  if (name && name.trim() !== player.name) {
    editData.name = name.trim();
  }

  const highestRating = formData.get("highest_rating") as string;
  if (highestRating !== (player.highest_rating || "")) {
    editData.highest_rating = highestRating || undefined;
  }

  const activeYears = formData.get("active_years") as string;
  if (activeYears !== (player.active_years || "")) {
    editData.active_years = activeYears || undefined;
  }

  const playingStyle = formData.get("playing_style") as string;
  if (playingStyle !== (player.playing_style || "")) {
    editData.playing_style = playingStyle || undefined;
  }

  const birthCountry = formData.get("birth_country") as string;
  if (birthCountry !== (player.birth_country || "")) {
    editData.birth_country = birthCountry || undefined;
  }

  const represents = formData.get("represents") as string;
  if (represents !== (player.represents || "")) {
    editData.represents = represents || undefined;
  }

  // Check if there are any changes
  if (Object.keys(editData).length === 0) {
    return data(
      { error: "No changes detected" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  try {
    // Insert player edit
    const supabase = sbServerClient.client;
    const { data: playerEdit, error: submitError } = await supabase
      .from("player_edits")
      .insert({
        player_id: player.id,
        user_id: userResponse.data.user.id,
        edit_data: editData,
        status: "pending",
      })
      .select()
      .single();

    if (submitError) {
      console.error("Player edit submission error:", submitError);
      return data(
        { error: "Failed to submit player edit" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Send Discord notification (non-blocking)
    try {
      const notificationData = {
        id: playerEdit.id,
        player_name: player.name,
        player_id: player.id,
        edit_data: editData,
        submitter_email: userResponse.data.user.email || "Anonymous",
      };

      // Get environment variables
      const env = context.cloudflare.env as Cloudflare.Env;
      
      // Use direct Discord webhook (avoiding worker-to-worker call)
      if (env.DISCORD_WEBHOOK_URL) {
        
        // Create a summary of the changes
        const changes = [];
        if (editData.name) changes.push(`Name: ${editData.name}`);
        if (editData.highest_rating) changes.push(`Rating: ${editData.highest_rating}`);
        if (editData.active_years) changes.push(`Active: ${editData.active_years}`);
        if (editData.playing_style) changes.push(`Style: ${editData.playing_style}`);
        if (editData.birth_country) changes.push(`Birth Country: ${editData.birth_country}`);
        if (editData.represents) changes.push(`Represents: ${editData.represents}`);

        const embed = {
          title: "🏓 Player Edit Submitted",
          description: "A player information update has been submitted and needs moderation.",
          color: 0xe67e22, // Orange color to distinguish from reviews
          fields: [
            {
              name: "Player",
              value: notificationData.player_name || "Unknown Player",
              inline: true,
            },
            {
              name: "Submitted by",
              value: notificationData.submitter_email || "Anonymous",
              inline: true,
            },
            {
              name: "Changes",
              value: changes.length > 0 ? changes.join("\n") : "No changes specified",
              inline: false,
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
                label: "Approve Edit",
                custom_id: `approve_player_edit_${notificationData.id}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger/Red
                label: "Reject Edit",
                custom_id: `reject_player_edit_${notificationData.id}`,
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
      console.error("Player edit Discord notification failed:", error);
      // Don't fail the submission if Discord notification fails
    }

    return data(
      { success: true, message: "Player edit submitted successfully! It will be reviewed by our team." },
      { headers: sbServerClient.headers }
    );
  } catch (error) {
    console.error("Player edit submission error:", error);
    return data(
      { error: "Failed to submit player edit" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function PlayerEdit({ loaderData }: Route.ComponentProps) {
  const { user, player, env, playingStyles, countries } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
    { label: "Edit", href: `/players/${player.slug}/edit` },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection background="white" padding="medium">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Edit Player: {player.name}
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Update {player.name}'s profile information. All changes will be
            reviewed before being published.
          </p>
        </div>

        <PlayerEditForm 
          player={player} 
          env={env} 
          userId={user.id} 
          playingStyles={playingStyles}
          countries={countries}
        />
      </PageSection>
    </div>
  );
}

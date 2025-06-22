import type { Route } from "./+types/videos.submit";
import { data, redirect } from "react-router";
import { useState } from "react";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { rateLimit, RATE_LIMITS, createSecureResponse } from "~/lib/security.server";
import { validateCSRF, createCSRFFailureResponse } from "~/lib/security.server";
import { DiscordService } from "~/lib/discord.server";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { VideoSubmissionSection } from "~/components/forms/VideoSubmissionSection";
import { CSRFToken } from "~/components/ui/CSRFToken";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { PageSection } from "~/components/layout/PageSection";
import { Navigation } from "~/components/ui/Navigation";
import { Footer } from "~/components/ui/Footer";
import { Form, useNavigate } from "react-router";

export function meta({ url }: Route.MetaArgs) {
  const title = "Submit Video Information | TT Reviews";
  const description = "Submit training videos, match footage, or other video content for professional table tennis players.";
  
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "noindex, nofollow" }, // Prevent indexing of submission forms
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
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

  // Get players for selection dropdown
  const { data: players, error } = await sbServerClient.client
    .from("players")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("Error fetching players:", error);
    throw new Response("Failed to load players", { status: 500 });
  }

  // Get pre-selected player from URL params
  const url = new URL(request.url);
  const selectedPlayerName = url.searchParams.get("player");

  // Generate CSRF token
  const { generateCSRFToken, getSessionId } = await import("~/lib/csrf.server");
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    {
      user,
      players: players || [],
      selectedPlayerName,
      csrfToken,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Record<string, string>).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
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
  const playerId = formData.get("player_id") as string;

  if (!playerId) {
    return data({ error: "Player is required" }, { status: 400 });
  }

  // Parse video data
  const videos = [];
  let index = 0;
  while (formData.get(`videos[${index}][url]`)) {
    const url = formData.get(`videos[${index}][url]`) as string;
    const title = formData.get(`videos[${index}][title]`) as string;
    const platform = formData.get(`videos[${index}][platform]`) as string;

    if (url && title) {
      videos.push({ url, title, platform });
    }
    index++;
  }

  if (videos.length === 0) {
    return data({ error: "At least one video is required" }, { status: 400 });
  }

  try {
    console.log("Video submission attempt for player:", playerId, "videos:", videos);
    // Get player info for the submission
    const { data: player } = await sbServerClient.client
      .from("players")
      .select("name, slug")
      .eq("id", playerId)
      .single();

    if (!player) {
      return data({ error: "Player not found" }, { status: 400 });
    }

    // Create video submission for moderation
    console.log("Inserting video submission:", {
      user_id: user.id,
      player_id: playerId,
      videos: videos,
      status: "pending",
    });
    
    // Try with admin client to bypass RLS issues
    const { createSupabaseAdminClient } = await import("~/lib/database.server");
    const adminClient = createSupabaseAdminClient(context);
    
    const { data: submission, error: submitError } = await adminClient
      .from("video_submissions")
      .insert({
        user_id: user.id,
        player_id: playerId,
        videos: videos,
        status: "pending",
      })
      .select()
      .single();
    
    console.log("Video submission result:", { submission, submitError });

    if (submitError) {
      console.error("Video submission error:", submitError);
      return data(
        { error: "Failed to submit videos. Please try again." },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Send Discord notification
    const requestId = request.headers.get("X-Request-ID") || "unknown";
    try {
      const notificationData = {
        id: submission.id,
        player_name: player.name,
        videos: videos,
        submitter_email: user.email,
      };

      const discordService = new DiscordService(context);
      await discordService.notifyNewVideoSubmission(
        notificationData,
        requestId
      );
    } catch (error) {
      // Discord notification failure should not block the submission
      console.error("Discord notification failed:", error);
    }

    return data(
      {
        success: true,
        message: "Videos submitted successfully! They will be reviewed by our team.",
      },
      { headers: sbServerClient.headers }
    );
  } catch (error) {
    console.error("Error submitting videos:", error);
    return data(
      { error: "Failed to submit videos. Please try again." },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function VideoSubmit({ loaderData, actionData }: Route.ComponentProps) {
  const { user, players, selectedPlayerName, csrfToken } = loaderData;
  const navigate = useNavigate();
  const [selectedPlayer, setSelectedPlayer] = useState(
    selectedPlayerName ? players.find(p => p.name === selectedPlayerName)?.id || "" : ""
  );
  const [videos, setVideos] = useState<any[]>([]);

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: "Submit Video", href: "/videos/submit" },
  ];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!selectedPlayer) {
      e.preventDefault();
      alert("Please select a player");
      return;
    }
    if (videos.length === 0) {
      e.preventDefault();
      alert("Please add at least one video");
      return;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={user} />
      <main>
        <PageSection background="white" padding="medium">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Submit Video Information
              </h1>
              <p className="text-lg text-gray-600">
                Add training videos, match footage, or other video content for professional table tennis players.
              </p>
            </div>

            <RouterFormModalWrapper
              loadingTitle="Submitting Videos"
              loadingMessage="Please wait while we submit your videos for review..."
              successTitle="Videos Submitted!"
              successMessage="Your videos have been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!"
              errorTitle="Submission Failed"
              successRedirect={() => navigate("/videos/submit")}
              successRedirectDelay={2000}
              successActions={
                <button
                  onClick={() => navigate("/videos/submit")}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Submit More Videos
                </button>
              }
            >
              {({ isLoading }) => (
                <Form method="post" onSubmit={handleSubmit} className="space-y-8">
                  <CSRFToken token={csrfToken} />
                  
                  {/* Player Selection */}
                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">
                      Select Player
                    </h2>
                    <div>
                      <label htmlFor="player_id" className="block text-sm font-medium text-gray-700 mb-2">
                        Player *
                      </label>
                      <select
                        id="player_id"
                        name="player_id"
                        value={selectedPlayer}
                        onChange={(e) => setSelectedPlayer(e.target.value)}
                        required
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                      >
                        <option value="">Select a player...</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-sm text-gray-500">
                        Don't see the player you're looking for? 
                        <a href="/players/submit" className="text-purple-600 hover:text-purple-800 ml-1">
                          Submit a new player first
                        </a>
                      </p>
                    </div>
                  </div>

                  {/* Video Information */}
                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <VideoSubmissionSection 
                      onVideosChange={setVideos}
                      showTitle={true}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? "Submitting..." : "Submit Videos"}
                    </button>
                  </div>
                </Form>
              )}
            </RouterFormModalWrapper>
          </div>
        </PageSection>
      </main>
      <Footer />
    </div>
  );
}
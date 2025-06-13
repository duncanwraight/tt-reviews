import type { Route } from "./+types/profile";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService, createSupabaseAdminClient } from "~/lib/database.server";
import { createModerationService } from "~/lib/moderation.server";
import { redirect, data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";
import { PageSection } from "~/components/layout/PageSection";
import { ProfileInfo } from "~/components/profile/ProfileInfo";
import { UserReviews } from "~/components/profile/UserReviews";
import { UserSubmissions } from "~/components/profile/UserSubmissions";
import { QuickActions } from "~/components/profile/QuickActions";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Fetch user reviews and submissions
  const dbService = new DatabaseService(context);
  const userReviews = await dbService.getUserReviews(userResponse.data.user.id);
  
  // Fetch user submissions
  const adminSupabase = createSupabaseAdminClient(context);
  const moderationService = createModerationService(adminSupabase);
  const userSubmissions = await moderationService.getUserSubmissions(userResponse.data.user.id);

  return data(
    {
      user: userResponse.data.user,
      reviews: userReviews,
      submissions: userSubmissions,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, reviews, submissions, env } = loaderData;

  return (
    <PageLayout user={user}>
      <PageSection background="white" padding="medium">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
            <p className="text-gray-600">
              Manage your account and review history
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <ProfileInfo user={user} />
              
              {/* Content sections */}
              <UserReviews reviews={reviews} />
              <UserSubmissions submissions={submissions} />
            </div>

            <div className="lg:col-span-1">
              <QuickActions env={env} />
            </div>
          </div>
        </div>
      </PageSection>
    </PageLayout>
  );
}

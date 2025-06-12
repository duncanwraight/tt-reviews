import type { Route } from "./+types/profile";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { redirect, data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";
import { PageSection } from "~/components/layout/PageSection";
import { ProfileInfo } from "~/components/profile/ProfileInfo";
import { UserReviews } from "~/components/profile/UserReviews";
import { QuickActions } from "~/components/profile/QuickActions";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  
  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }
  
  // Fetch user reviews
  const dbService = new DatabaseService(context);
  const userReviews = await dbService.getUserReviews(userResponse.data.user.id);
  
  return data({
    user: userResponse.data.user,
    reviews: userReviews,
    env: {
      SUPABASE_URL: (context.cloudflare.env as Record<string, string>).SUPABASE_URL!,
      SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>).SUPABASE_ANON_KEY!,
    },
  }, { headers: sbServerClient.headers });
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, reviews, env } = loaderData;

  return (
    <PageLayout user={user}>
      <PageSection background="white" padding="medium">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
            <p className="text-gray-600">Manage your account and review history</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <ProfileInfo user={user} />
              <UserReviews reviews={reviews} />
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
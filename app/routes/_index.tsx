import type { Route } from "./+types/_index";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { DatabaseService } from "~/lib/database.server";
import { data } from "react-router";
import { withLoaderCorrelation, enhanceContextWithUser, logUserAction } from "~/lib/middleware/correlation.server";

import { Navigation } from "~/components/ui/Navigation";
import { HeroSection } from "~/components/sections/HeroSection";
import { FeaturedEquipmentSection } from "~/components/sections/FeaturedEquipmentSection";
import { PopularPlayersSection } from "~/components/sections/PopularPlayersSection";
import { CategoriesSection } from "~/components/sections/CategoriesSection";
import { Footer } from "~/components/ui/Footer";

interface EquipmentDisplay {
  id: string;
  name: string;
  slug: string;
  category: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
}

interface PlayerDisplay {
  id: string;
  name: string;
  slug: string;
  highest_rating?: string;
  playing_style?: string;
  currentSetup?: string;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TT Reviews - Table Tennis Equipment Reviews & Player Database" },
    {
      name: "description",
      content:
        "Discover the best table tennis equipment through professional reviews and explore detailed player setups. Your comprehensive guide to table tennis gear and pro player information.",
    },
    {
      name: "keywords",
      content:
        "table tennis, ping pong, equipment reviews, professional players, rubber, blade, ball, tournament equipment",
    },
    {
      property: "og:title",
      content: "TT Reviews - Table Tennis Equipment Reviews & Player Database",
    },
    {
      property: "og:description",
      content:
        "Discover the best table tennis equipment through professional reviews and explore detailed player setups.",
    },
    { property: "og:type", content: "website" },
  ];
}

export const loader = withLoaderCorrelation(async ({ request, context, logContext }: Route.LoaderArgs & { logContext: any }) => {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Enhance log context with user information
  const enhancedContext = enhanceContextWithUser(logContext, user);

  const db = new DatabaseService(context, enhancedContext);

  const [equipmentWithStats, allPlayers] = await Promise.all([
    db.getPopularEquipment(6),
    db.getPlayersWithoutFilters(),
  ]);

  const featuredEquipment: EquipmentDisplay[] = equipmentWithStats.map(
    (equipment) => ({
      ...equipment,
      rating: equipment.averageRating || undefined,
      reviewCount: equipment.reviewCount ? Number(equipment.reviewCount) : undefined,
    })
  );

  const popularPlayers: PlayerDisplay[] = allPlayers
    .filter((player) => player.active)
    .slice(0, 6)
    .map((player) => {
      // Get the most recent equipment setup
      const recentSetup = player.equipment_setups?.[0];
      const currentSetup = recentSetup 
        ? `${recentSetup.blade_name || 'Professional'} Setup`
        : "Professional Setup";
      
      return {
        ...player,
        currentSetup,
      };
    });

  // Log user action for analytics
  logUserAction('view_homepage', enhancedContext, {
    featured_equipment_count: featuredEquipment.length,
    popular_players_count: popularPlayers.length,
  });

  return data(
    {
      user,
      featuredEquipment,
      popularPlayers,
    },
    { headers: sbServerClient.headers }
  );
});

export default function Index({ loaderData }: Route.ComponentProps) {
  const { user, featuredEquipment, popularPlayers } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={user} />
      <main>
        <HeroSection />
        <FeaturedEquipmentSection equipment={featuredEquipment} />
        <PopularPlayersSection players={popularPlayers} />
        <CategoriesSection />
      </main>
      <Footer />
    </div>
  );
}

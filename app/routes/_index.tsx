import type { Route } from "./+types/_index";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { data } from "react-router";

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
    { name: "description", content: "Discover the best table tennis equipment through professional reviews and explore detailed player setups. Your comprehensive guide to table tennis gear and pro player information." },
    { name: "keywords", content: "table tennis, ping pong, equipment reviews, professional players, rubber, blade, ball, tournament equipment" },
    { property: "og:title", content: "TT Reviews - Table Tennis Equipment Reviews & Player Database" },
    { property: "og:description", content: "Discover the best table tennis equipment through professional reviews and explore detailed player setups." },
    { property: "og:type", content: "website" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  
  const db = new DatabaseService(context);
  
  const [recentEquipment, allPlayers] = await Promise.all([
    db.getRecentEquipment(6),
    db.getAllPlayers()
  ]);

  const featuredEquipment: EquipmentDisplay[] = recentEquipment.map(equipment => ({
    ...equipment,
    rating: 4.2,
    reviewCount: Math.floor(Math.random() * 20) + 1
  }));

  const popularPlayers: PlayerDisplay[] = allPlayers
    .filter(player => player.active)
    .slice(0, 6)
    .map(player => ({
      ...player,
      currentSetup: "Professional Setup"
    }));
  
  return data({ 
    user: userResponse?.data?.user || null,
    featuredEquipment,
    popularPlayers,
  }, { headers: sbServerClient.headers });
}

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
import type { Route } from "./+types/players.$slug";
import { data } from "react-router";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `Player: ${params.slug} | TT Reviews` },
    { name: "description", content: "Player details and equipment setup" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  return data({ 
    slug: params.slug,
    message: "Player detail page - coming soon"
  });
}

export default function PlayerDetail({ loaderData }: Route.ComponentProps) {
  const { slug, message } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Player: {slug}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
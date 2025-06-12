import type { Route } from "./+types/equipment.$slug";
import { data } from "react-router";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `Equipment: ${params.slug} | TT Reviews` },
    { name: "description", content: "Equipment details and reviews" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  return data({ 
    slug: params.slug,
    message: "Equipment detail page - coming soon"
  });
}

export default function EquipmentDetail({ loaderData }: Route.ComponentProps) {
  const { slug, message } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Equipment: {slug}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
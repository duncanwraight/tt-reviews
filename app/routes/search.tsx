import type { Route } from "./+types/search";
import { data } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Search | TT Reviews" },
    { name: "description", content: "Search table tennis equipment and players" },
  ];
}

export async function loader(): Promise<Route.LoaderData> {
  return data({ 
    message: "Search page - coming soon"
  });
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { message } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Search</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
import type { Route } from "./+types/players";
import { data } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Players | TT Reviews" },
    { name: "description", content: "Professional table tennis players and their equipment setups" },
  ];
}

export async function loader(): Promise<Route.LoaderData> {
  return data({ 
    message: "Players index page - coming soon"
  });
}

export default function Players({ loaderData }: Route.ComponentProps) {
  const { message } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Players</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
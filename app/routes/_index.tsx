import { redirect } from "react-router";
import type { Route } from "./+types/_index";

export async function loader(): Promise<Response> {
  // Redirect root to home page
  return redirect("/home");
}

export default function Index() {
  // This should never render due to the redirect
  return null;
}
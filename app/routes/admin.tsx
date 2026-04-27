import { Outlet } from "react-router";
import type { Route } from "./+types/admin";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { data, redirect } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";
import { AdminNav } from "~/components/admin/AdminNav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Check admin role for access control
  if (user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  return data(
    {
      user,
    },
    { headers: sbServerClient.headers }
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <PageLayout user={user}>
      <div className="min-h-screen bg-gray-100">
        {/* Admin Header — thin context bar; sub-pages own their h1/h2 */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-end items-center h-10 gap-3">
              <span className="text-xs text-gray-600">{user.email}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-800">
                Admin
              </span>
            </div>
          </div>
        </div>

        {/* Admin Navigation */}
        <AdminNav />

        {/* Admin Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}

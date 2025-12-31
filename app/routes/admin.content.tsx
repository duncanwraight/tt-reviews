import type { Route } from "./+types/admin.content";
import { data, redirect } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { createLogContext } from "~/lib/logger.server";
import { getUserWithRole } from "~/lib/auth.server";
import { getServerClient } from "~/lib/supabase.server";
import { ContentManager } from "~/components/admin/ContentManager";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Content Management | Admin | TT Reviews" },
    {
      name: "description",
      content: "Manage site content and text snippets",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  if (!user || user.role !== "admin") {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const logContext = createLogContext("admin_content_loader");
  const db = new DatabaseService(context, logContext);
  const content = await db.content.getAllContentRecords();

  return data(
    {
      user,
      content,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  if (!user || user.role !== "admin") {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const logContext = createLogContext("admin_content_action");
  const db = new DatabaseService(context, logContext);

  try {
    switch (intent) {
      case "update": {
        const key = formData.get("key") as string;
        const contentValue = formData.get("content") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;

        if (!key || !contentValue || !description || !category) {
          return data(
            { error: "Missing required fields" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        await db.content.updateContent(key, {
          content: contentValue,
          description,
          category,
        });

        return data(
          { success: true, message: "Content updated successfully" },
          { headers: sbServerClient.headers }
        );
      }

      case "create": {
        const key = formData.get("key") as string;
        const contentValue = formData.get("content") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;

        if (!key || !contentValue || !description || !category) {
          return data(
            { error: "Missing required fields" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        await db.content.createContent({
          key,
          content: contentValue,
          description,
          category,
        });

        return data(
          { success: true, message: "Content created successfully" },
          { headers: sbServerClient.headers }
        );
      }

      case "delete": {
        const key = formData.get("key") as string;

        if (!key) {
          return data(
            { error: "Missing content key" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        await db.content.deleteContent(key);

        return data(
          { success: true, message: "Content deleted successfully" },
          { headers: sbServerClient.headers }
        );
      }

      default:
        return data(
          { error: "Invalid action" },
          { status: 400, headers: sbServerClient.headers }
        );
    }
  } catch (error) {
    console.error("Content management error:", error);
    return data(
      { error: "Failed to process content action" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function AdminContent({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData;

  return <ContentManager content={content} />;
}

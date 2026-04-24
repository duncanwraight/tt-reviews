import type { AppLoadContext } from "react-router";
import { redirect } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { enforceAdminActionGate, issueCSRFToken } from "~/lib/security.server";

type ServerClient = ReturnType<typeof getServerClient>;

/**
 * Minimal shape the admin gates guarantee. The underlying
 * `getUserWithRole` carries extra Supabase auth fields through, but the
 * helpers only commit to `id` + `role` so admin routes don't accidentally
 * rely on the wider shape.
 */
export interface AdminUser {
  id: string;
  role: string;
}

export interface AdminActionContext {
  sbServerClient: ServerClient;
  user: AdminUser;
  supabaseAdmin: SupabaseClient;
}

export interface AdminLoaderContext extends AdminActionContext {
  csrfToken: string;
}

/**
 * Loader-side admin gate: confirms the caller is an admin and mints a
 * CSRF token for forms the page will render. Returns a `Response`
 * (302 to `/`) when the caller must bail; otherwise the loader context.
 * The caller does `if (ctx instanceof Response) return ctx;`.
 */
export async function ensureAdminLoader(
  request: Request,
  context: AppLoadContext
): Promise<Response | AdminLoaderContext> {
  const sbServerClient = getServerClient(request, context);
  const rawUser = await getUserWithRole(sbServerClient, context);
  const user = rawUser as AdminUser | null;
  if (!user || user.role !== "admin") {
    return redirect("/", { headers: sbServerClient.headers });
  }
  const csrfToken = await issueCSRFToken(request, context, user.id);
  const supabaseAdmin = createSupabaseAdminClient(context);
  return { sbServerClient, user, supabaseAdmin, csrfToken };
}

/**
 * Action-side admin gate: confirms the caller is an admin, validates the
 * form CSRF token, and enforces the per-admin rate limit (keyed on
 * `userId` so a compromised cred can't rotate IPs). Returns a `Response`
 * (302/403/429) when the caller must bail; otherwise the action context.
 *
 * The name `ensureAdminAction` is load-bearing: `scripts/security-sweep.sh`
 * greps for it (alongside `enforceAdminActionGate` / `validateCSRF`) to
 * prove every `admin.*.tsx` action gates CSRF + rate limit. Rename with
 * the sweep in lockstep.
 */
export async function ensureAdminAction(
  request: Request,
  context: AppLoadContext
): Promise<Response | AdminActionContext> {
  const sbServerClient = getServerClient(request, context);
  const rawUser = await getUserWithRole(sbServerClient, context);
  const user = rawUser as AdminUser | null;
  if (!user || user.role !== "admin") {
    return redirect("/", { headers: sbServerClient.headers });
  }
  const gate = await enforceAdminActionGate(request, context, user.id);
  if (gate) return gate;
  const supabaseAdmin = createSupabaseAdminClient(context);
  return { sbServerClient, user, supabaseAdmin };
}

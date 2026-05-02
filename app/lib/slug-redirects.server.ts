import type { SupabaseClient } from "@supabase/supabase-js";

// TT-141. Slug-rename 301 forwarding.
//
// Two surfaces:
//   - findSlugRedirect: read-only lookup used by detail-page loaders
//     when the slug doesn't resolve to an entity. Anon-key safe — the
//     SELECT policy on slug_redirects is "USING (true)".
//   - recordSlugRedirect: write path used by the equipment_edit
//     applier (and any future player-rename applier). Must be called
//     with a service-role client; the writer policy gates on
//     auth.jwt() ->> 'user_role' = 'admin' which doesn't apply to
//     service role (which bypasses RLS), so this works either way.

export type SlugEntityType = "equipment" | "player";

/**
 * Look up the canonical (current) slug for `oldSlug`. Returns null
 * if no redirect exists. Detail-page loaders call this on a slug
 * miss before falling through to 404.
 */
export async function findSlugRedirect(
  client: SupabaseClient,
  entityType: SlugEntityType,
  oldSlug: string
): Promise<string | null> {
  const { data } = await client
    .from("slug_redirects")
    .select("new_slug")
    .eq("entity_type", entityType)
    .eq("old_slug", oldSlug)
    .maybeSingle();
  return (data?.new_slug as string | undefined) ?? null;
}

export type RecordResult = { ok: true } | { ok: false; error: string };

/**
 * Record a slug rename. Call after the entity row's slug has been
 * updated. Three steps:
 *
 *   A) DELETE any redirect rows whose old_slug equals the new slug.
 *      The entity now resolves at that path directly; a stale
 *      redirect would shadow it (the A → B → A "rename back" case).
 *   B) UPDATE every redirect that pointed at the old slug to point
 *      at the new slug. Collapses chains so every old URL forwards
 *      in one hop.
 *   C) UPSERT the (oldSlug → newSlug) row. ON CONFLICT covers the
 *      case where oldSlug had previously existed as a redirect
 *      source (rare, but possible after a multi-hop chain).
 *
 * No-op when oldSlug === newSlug.
 *
 * Not transactional across the three statements. If the worker dies
 * between steps, the caller's slug update has already landed — the
 * user sees the new URL but loses the 301 from the old one. The next
 * rename re-establishes it. Acceptable failure mode.
 */
export async function recordSlugRedirect(
  serviceRoleClient: SupabaseClient,
  entityType: SlugEntityType,
  oldSlug: string,
  newSlug: string,
  createdBy: string | null
): Promise<RecordResult> {
  if (oldSlug === newSlug) return { ok: true };

  // A) Drop any redirect that would shadow the new canonical slug.
  const delResult = await serviceRoleClient
    .from("slug_redirects")
    .delete()
    .match({ entity_type: entityType, old_slug: newSlug });
  if (delResult.error) return { ok: false, error: delResult.error.message };

  // B) Collapse chains: any X → oldSlug now points X → newSlug.
  const updResult = await serviceRoleClient
    .from("slug_redirects")
    .update({ new_slug: newSlug })
    .match({ entity_type: entityType, new_slug: oldSlug });
  if (updResult.error) return { ok: false, error: updResult.error.message };

  // C) Record the new redirect.
  const upsertResult = await serviceRoleClient.from("slug_redirects").upsert(
    {
      entity_type: entityType,
      old_slug: oldSlug,
      new_slug: newSlug,
      created_by: createdBy,
    },
    { onConflict: "entity_type,old_slug" }
  );
  if (upsertResult.error)
    return { ok: false, error: upsertResult.error.message };

  return { ok: true };
}

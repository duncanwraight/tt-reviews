import type { Route } from "./+types/admin.equipment-photos";
import { data, redirect, Form, useNavigation } from "react-router";
import { useState } from "react";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { Inbox, Loader2 } from "lucide-react";
import {
  pickCandidate,
  rejectCandidate,
  resourceEquipment,
  skipEquipment,
} from "~/lib/photo-sourcing/review.server";
import type { SourcingEnv } from "~/lib/photo-sourcing/source.server";
import { buildProvidersFromEnv } from "~/lib/photo-sourcing/providers/factory";
import { buildEquipmentImageUrl } from "~/lib/imageUrl";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Equipment Photos | Admin | TT Reviews" },
    {
      name: "description",
      content: "Pick the right product image for each equipment row.",
    },
  ];
}

interface CandidateView {
  id: string;
  r2_key: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  match_kind: "trailing" | "loose";
  tier: number;
}

interface EquipmentReviewRow {
  id: string;
  slug: string;
  name: string;
  manufacturer: string;
  category: string;
  subcategory: string | null;
  candidates: CandidateView[];
}

const CATEGORY_ORDER: Record<string, number> = { blade: 0, rubber: 1 };

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin, csrfToken } = gate;

  // Query candidates first, then look up the (much smaller) set of
  // equipment rows that have any. The opposite order would push a
  // 290-element IN list onto the candidates URL — over PostgREST's
  // ~8000-char URL ceiling once equipment grew past a few dozen.
  const { data: candidateRows, error: candidateError } = await supabaseAdmin
    .from("equipment_photo_candidates")
    .select(
      "id, equipment_id, r2_key, source_url, image_source_host, source_label, match_kind, tier"
    )
    .is("picked_at", null)
    .order("tier", { ascending: true });

  if (candidateError) {
    Logger.error(
      "equipment-photos: candidate load failed",
      createLogContext("admin-equipment-photos", { userId: user.id }),
      candidateError instanceof Error ? candidateError : undefined
    );
    return data(
      { items: [] as EquipmentReviewRow[], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  const candidatesByEquipment = new Map<string, CandidateView[]>();
  for (const row of (candidateRows ?? []) as Array<
    CandidateView & { equipment_id: string }
  >) {
    const list = candidatesByEquipment.get(row.equipment_id) ?? [];
    list.push({
      id: row.id,
      r2_key: row.r2_key,
      source_url: row.source_url,
      image_source_host: row.image_source_host,
      source_label: row.source_label,
      match_kind: row.match_kind,
      tier: row.tier,
    });
    candidatesByEquipment.set(row.equipment_id, list);
  }

  const candidateEquipmentIds = [...candidatesByEquipment.keys()];
  if (candidateEquipmentIds.length === 0) {
    return data(
      { items: [] as EquipmentReviewRow[], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  const { data: equipmentRows, error: equipmentError } = await supabaseAdmin
    .from("equipment")
    .select("id, slug, name, manufacturer, category, subcategory")
    .in("id", candidateEquipmentIds)
    .is("image_key", null)
    .is("image_skipped_at", null);

  if (equipmentError) {
    Logger.error(
      "equipment-photos: equipment load failed",
      createLogContext("admin-equipment-photos", { userId: user.id }),
      equipmentError instanceof Error ? equipmentError : undefined
    );
    return data(
      { items: [] as EquipmentReviewRow[], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  const items: EquipmentReviewRow[] = (equipmentRows ?? [])
    .map(r => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      manufacturer: r.manufacturer as string,
      category: r.category as string,
      subcategory: (r.subcategory ?? null) as string | null,
      candidates: candidatesByEquipment.get(r.id as string) ?? [],
    }))
    .filter(r => r.candidates.length > 0)
    .sort((a, b) => {
      const ca = CATEGORY_ORDER[a.category] ?? 99;
      const cb = CATEGORY_ORDER[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      const ma = a.manufacturer.localeCompare(b.manufacturer);
      if (ma !== 0) return ma;
      return a.name.localeCompare(b.name);
    });

  return data({ items, user, csrfToken }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const env = context.cloudflare.env as unknown as Partial<SourcingEnv> & {
    IMAGE_BUCKET?: R2Bucket;
  };
  if (!env.IMAGE_BUCKET) {
    return data(
      { error: "R2 bucket not bound" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
  const bucket = env.IMAGE_BUCKET;

  const formData = await request.formData();
  const op = formData.get("op");
  const equipmentId = (formData.get("equipmentId") as string) ?? "";
  const candidateId = (formData.get("candidateId") as string) ?? "";
  const slug = (formData.get("slug") as string) ?? "";

  // Only `resource` strictly needs the Brave key. pick/reject/skip do
  // best-effort R2 deletes that are wrapped in .catch in
  // deleteCandidates, so missing creds just means orphaned bytes in
  // R2 — the DB side stays consistent.
  if (op === "resource" && !env.BRAVE_SEARCH_API_KEY) {
    return data(
      { error: "photo sourcing not configured" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  try {
    if (op === "pick") {
      if (!equipmentId || !candidateId) {
        return data(
          { error: "Missing equipmentId or candidateId" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await pickCandidate(supabaseAdmin, bucket, {
        equipmentId,
        candidateId,
        pickedBy: user.id,
      });
    } else if (op === "reject") {
      if (!candidateId) {
        return data(
          { error: "Missing candidateId" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await rejectCandidate(supabaseAdmin, bucket, candidateId);
    } else if (op === "skip") {
      if (!equipmentId) {
        return data(
          { error: "Missing equipmentId" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await skipEquipment(supabaseAdmin, bucket, equipmentId);
    } else if (op === "resource") {
      if (!equipmentId || !slug) {
        return data(
          { error: "Missing equipmentId or slug" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await resourceEquipment(
        supabaseAdmin,
        bucket,
        env as SourcingEnv,
        equipmentId,
        slug,
        {
          providers: buildProvidersFromEnv(
            env as Parameters<typeof buildProvidersFromEnv>[0]
          ),
        }
      );
    } else {
      return data(
        { error: "Unknown op" },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    Logger.info(
      "equipment-photos action",
      createLogContext("admin-equipment-photos", {
        op: String(op),
        equipmentId,
        candidateId,
        userId: user.id,
      })
    );
    return redirect("/admin/equipment-photos", {
      headers: sbServerClient.headers,
    });
  } catch (err) {
    Logger.error(
      "equipment-photos action failed",
      createLogContext("admin-equipment-photos", {
        op: String(op),
        equipmentId,
        candidateId,
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function AdminEquipmentPhotos({
  loaderData,
}: Route.ComponentProps) {
  const { items, csrfToken } = loaderData;
  const navigation = useNavigation();

  // Any in-flight POST to a route under /admin/equipment-photos —
  // bulk source, pick, reject, skip, re-source — counts as "the
  // queue is mutating". Disable the bulk button + show a global
  // hint while that's happening so the user knows their click
  // landed (each chunk takes ~6s for Brave throttling).
  const isMutating =
    navigation.state === "submitting" &&
    (navigation.formAction?.startsWith("/admin/equipment-photos") ?? false);
  const isBulkSourcing =
    isMutating &&
    navigation.formAction === "/admin/equipment-photos-bulk-source";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Equipment Photo Review Queue
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {items.length} item{items.length === 1 ? "" : "s"} pending
          </span>
          <Form method="post" action="/admin/equipment-photos-bulk-source">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button
              type="submit"
              disabled={isMutating}
              className="text-sm px-3 py-1.5 rounded bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isBulkSourcing ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Sourcing…
                </>
              ) : (
                "Source next chunk"
              )}
            </button>
          </Form>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-500">
          <Inbox className="size-10 mx-auto mb-3 text-gray-400" aria-hidden />
          <p className="font-medium">No equipment awaiting photo review.</p>
          <p className="text-sm mt-1">
            Run the bulk source job, or trigger a per-item sourcing run.
          </p>
        </div>
      ) : (
        <ul className="space-y-6">
          {items.map(item => (
            <EquipmentReviewCard
              key={item.id}
              item={item}
              csrfToken={csrfToken}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface EquipmentReviewCardProps {
  item: EquipmentReviewRow;
  csrfToken: string;
}

function EquipmentReviewCard({ item, csrfToken }: EquipmentReviewCardProps) {
  return (
    <li
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      data-testid="equipment-review-card"
      data-equipment-slug={item.slug}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
          <p className="text-sm text-gray-600">
            {item.manufacturer} · {item.category}
            {item.subcategory ? ` · ${item.subcategory}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="op" value="resource" />
            <input type="hidden" name="equipmentId" value={item.id} />
            <input type="hidden" name="slug" value={item.slug} />
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Re-source
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="op" value="skip" />
            <input type="hidden" name="equipmentId" value={item.id} />
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
            >
              None of these
            </button>
          </Form>
        </div>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {item.candidates.map(candidate => (
          <CandidateTile
            key={candidate.id}
            equipmentId={item.id}
            candidate={candidate}
            csrfToken={csrfToken}
          />
        ))}
      </ul>
    </li>
  );
}

interface CandidateTileProps {
  equipmentId: string;
  candidate: CandidateView;
  csrfToken: string;
}

function CandidateTile({
  equipmentId,
  candidate,
  csrfToken,
}: CandidateTileProps) {
  return (
    <li
      className="border border-gray-200 rounded-lg overflow-hidden flex flex-col"
      data-testid="candidate-tile"
      data-candidate-id={candidate.id}
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center">
        <CandidateImage
          r2Key={candidate.r2_key}
          alt={`Candidate from ${candidate.image_source_host ?? "unknown source"}`}
        />
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
              candidate.tier === 1
                ? "bg-emerald-100 text-emerald-800"
                : candidate.tier === 2
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {candidate.source_label ?? "other"}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
              candidate.match_kind === "trailing"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {candidate.match_kind === "trailing" ? "exact" : "variant?"}
          </span>
        </div>
        {candidate.source_url ? (
          <a
            href={candidate.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-purple-600 hover:text-purple-800 break-all line-clamp-2"
          >
            {candidate.source_url}
          </a>
        ) : null}
        <div className="flex items-center gap-2 mt-auto">
          <Form method="post" className="flex-1">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="op" value="pick" />
            <input type="hidden" name="equipmentId" value={equipmentId} />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button
              type="submit"
              className="w-full px-2 py-1.5 rounded bg-purple-600 text-white text-xs font-medium hover:bg-purple-700"
              data-testid="candidate-pick"
            >
              Pick
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="op" value="reject" />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button
              type="submit"
              className="px-2 py-1.5 rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-50"
              data-testid="candidate-reject"
            >
              Reject
            </button>
          </Form>
        </div>
      </div>
    </li>
  );
}

// Resilient image: tries the cdn-cgi/image transformation first, then
// falls back to the raw R2 object on error. The fallback exists
// because Cloudflare Image Transformations is a paid feature; if it's
// not enabled on the zone, the cdn-cgi URL 404s and we need to render
// the original bytes instead. The onError handler swaps src once and
// then bails out so a missing R2 object doesn't loop.
interface CandidateImageProps {
  r2Key: string;
  alt: string;
}

function CandidateImage({ r2Key, alt }: CandidateImageProps) {
  const [usingFallback, setUsingFallback] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const src = usingFallback
    ? `/api/images/${r2Key}`
    : buildEquipmentImageUrl(r2Key, "thumbnail");

  if (hasFailed) {
    return (
      <span className="text-xs text-gray-400 px-2 text-center">
        image unavailable
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-contain"
      loading="lazy"
      onError={() => {
        if (usingFallback) setHasFailed(true);
        else setUsingFallback(true);
      }}
    />
  );
}

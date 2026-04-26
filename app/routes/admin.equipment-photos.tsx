import type { Route } from "./+types/admin.equipment-photos";
import { data, redirect, Form } from "react-router";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { Inbox } from "lucide-react";
import {
  pickCandidate,
  rejectCandidate,
  resourceEquipment,
  skipEquipment,
} from "~/lib/photo-sourcing/review.server";
import type { SourcingEnv } from "~/lib/photo-sourcing/source.server";

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
  cf_image_id: string;
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

  const env = context.cloudflare.env as unknown as Partial<SourcingEnv>;
  const imagesHash = env.IMAGES_ACCOUNT_HASH ?? "";

  const { data: equipmentRows, error: equipmentError } = await supabaseAdmin
    .from("equipment")
    .select("id, slug, name, manufacturer, category, subcategory")
    .is("image_key", null)
    .is("image_skipped_at", null);

  if (equipmentError) {
    Logger.error(
      "equipment-photos: equipment load failed",
      createLogContext("admin-equipment-photos", { userId: user.id }),
      equipmentError instanceof Error ? equipmentError : undefined
    );
    return data(
      { items: [], user, csrfToken, imagesHash },
      { headers: sbServerClient.headers }
    );
  }

  const ids = (equipmentRows ?? []).map(r => r.id as string);
  if (ids.length === 0) {
    return data(
      { items: [] as EquipmentReviewRow[], user, csrfToken, imagesHash },
      { headers: sbServerClient.headers }
    );
  }

  const { data: candidateRows, error: candidateError } = await supabaseAdmin
    .from("equipment_photo_candidates")
    .select(
      "id, equipment_id, cf_image_id, source_url, image_source_host, source_label, match_kind, tier"
    )
    .in("equipment_id", ids)
    .is("picked_at", null)
    .order("tier", { ascending: true });

  if (candidateError) {
    Logger.error(
      "equipment-photos: candidate load failed",
      createLogContext("admin-equipment-photos", { userId: user.id }),
      candidateError instanceof Error ? candidateError : undefined
    );
    return data(
      { items: [] as EquipmentReviewRow[], user, csrfToken, imagesHash },
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
      cf_image_id: row.cf_image_id,
      source_url: row.source_url,
      image_source_host: row.image_source_host,
      source_label: row.source_label,
      match_kind: row.match_kind,
      tier: row.tier,
    });
    candidatesByEquipment.set(row.equipment_id, list);
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

  return data(
    { items, user, csrfToken, imagesHash },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const env = context.cloudflare.env as unknown as Partial<SourcingEnv>;
  if (
    !env.IMAGES_ACCOUNT_ID ||
    !env.IMAGES_ACCOUNT_HASH ||
    !env.IMAGES_API_TOKEN
  ) {
    return data(
      { error: "Cloudflare Images not configured" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  const formData = await request.formData();
  const op = formData.get("op");
  const equipmentId = (formData.get("equipmentId") as string) ?? "";
  const candidateId = (formData.get("candidateId") as string) ?? "";
  const slug = (formData.get("slug") as string) ?? "";

  try {
    if (op === "pick") {
      if (!equipmentId || !candidateId) {
        return data(
          { error: "Missing equipmentId or candidateId" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await pickCandidate(supabaseAdmin, env as SourcingEnv, {
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
      await rejectCandidate(supabaseAdmin, env as SourcingEnv, candidateId);
    } else if (op === "skip") {
      if (!equipmentId) {
        return data(
          { error: "Missing equipmentId" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      await skipEquipment(supabaseAdmin, env as SourcingEnv, equipmentId);
    } else if (op === "resource") {
      if (!equipmentId || !slug) {
        return data(
          { error: "Missing equipmentId or slug" },
          { status: 400, headers: sbServerClient.headers }
        );
      }
      if (!env.BRAVE_SEARCH_API_KEY) {
        return data(
          { error: "Brave search not configured" },
          { status: 500, headers: sbServerClient.headers }
        );
      }
      await resourceEquipment(
        supabaseAdmin,
        env as SourcingEnv,
        equipmentId,
        slug
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
  const { items, csrfToken, imagesHash } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Equipment Photo Review Queue
        </h2>
        <span className="text-sm text-gray-600">
          {items.length} item{items.length === 1 ? "" : "s"} pending
        </span>
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
              imagesHash={imagesHash}
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
  imagesHash: string;
}

function EquipmentReviewCard({
  item,
  csrfToken,
  imagesHash,
}: EquipmentReviewCardProps) {
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
            <input type="hidden" name="csrf_token" value={csrfToken} />
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
            <input type="hidden" name="csrf_token" value={csrfToken} />
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
            imagesHash={imagesHash}
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
  imagesHash: string;
}

function CandidateTile({
  equipmentId,
  candidate,
  csrfToken,
  imagesHash,
}: CandidateTileProps) {
  const thumbUrl = imagesHash
    ? `https://imagedelivery.net/${imagesHash}/${candidate.cf_image_id}/thumbnail`
    : "";

  return (
    <li
      className="border border-gray-200 rounded-lg overflow-hidden flex flex-col"
      data-testid="candidate-tile"
      data-candidate-id={candidate.id}
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Candidate from ${candidate.image_source_host ?? "unknown source"}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-gray-400">no preview</span>
        )}
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
            <input type="hidden" name="csrf_token" value={csrfToken} />
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
            <input type="hidden" name="csrf_token" value={csrfToken} />
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

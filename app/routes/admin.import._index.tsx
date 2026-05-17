// TT-243: equipment importer — selection page.
//
// The action is now fire-and-forget. It inserts an
// equipment_import_jobs row, chunks the products into ≤100-message
// `queue.sendBatch` calls (replacing TT-238's serial `queue.send`
// loop that hit Cloudflare's 50-subrequest cap on >~48 products),
// then 302s the operator to the dedicated job-detail page. All
// progress UI lives at /admin/import/jobs/:jobId — this page is
// strictly "fetch + select + enqueue + redirect" so a long-running
// import can't tie the form to a single browser tab.

import { useState } from "react";
import {
  data,
  Form,
  Link,
  redirect,
  useFetcher,
  useNavigation,
} from "react-router";
import { Loader2 } from "lucide-react";

import type { Route } from "./+types/admin.import._index";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { enqueueEquipmentImport } from "~/lib/equipment-import/enqueue.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import {
  fetchProductList,
  generateSlug,
  listItemToProduct,
  type RevspinCategory,
  type RevspinProduct,
} from "~/lib/revspin.server";

type RevspinProductWithSlug = RevspinProduct & { generatedSlug: string };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Import Equipment | Admin | TT Reviews" },
    {
      name: "description",
      content: "Import equipment from revspin.net into TT Reviews database.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

const CATEGORY_LABELS: Record<RevspinCategory, string> = {
  blade: "Blades",
  rubber: "Rubbers (Inverted)",
  pips_short: "Short Pips",
  pips_medium: "Medium Pips",
  pips_long: "Long Pips",
  anti: "Anti-Spin",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const url = new URL(request.url);
  const category = (url.searchParams.get("category") ||
    "blade") as RevspinCategory;

  // Pull the slug catalogue once so the table can hide rows that are
  // already imported. Used purely for filtering on the client — the
  // queue consumer also dedupes via ON CONFLICT (slug) DO NOTHING so
  // a stale list can't double-write.
  const { data: existingEquipment } = await supabaseAdmin
    .from("equipment")
    .select("slug");
  const existingSlugs = (existingEquipment ?? []).map(
    (e: { slug: string }) => e.slug
  );

  return data(
    {
      category,
      existingSlugs,
      existingCount: existingSlugs.length,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
}

interface FetchResult {
  intent: "fetch";
  products: RevspinProductWithSlug[];
  fetchError: string | null;
}

interface ImportFailure {
  intent: "import";
  error: string;
}

type ActionResult = FetchResult | ImportFailure;

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "fetch") {
    const category = formData.get("category") as RevspinCategory;
    try {
      const revspinProducts = await fetchProductList(category);
      const products = revspinProducts
        .map(item => {
          const product = listItemToProduct(item, category);
          if (!product) return null;
          return { ...product, generatedSlug: generateSlug(product.name) };
        })
        .filter((p): p is RevspinProductWithSlug => p !== null);

      return data<ActionResult>(
        { intent: "fetch", products, fetchError: null },
        { headers: sbServerClient.headers }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(
        "admin.import.fetch.failed",
        createLogContext("admin-import", { category }),
        err instanceof Error ? err : undefined
      );
      return data<ActionResult>(
        { intent: "fetch", products: [], fetchError: message },
        { headers: sbServerClient.headers }
      );
    }
  }

  if (intent === "import") {
    const productsJson = formData.get("products") as string;
    const subcategoryOverrideRaw = formData.get("subcategory") as string | null;
    const subcategoryOverride = subcategoryOverrideRaw || null;
    const products: RevspinProduct[] = JSON.parse(productsJson);

    const queue = (
      context.cloudflare.env as unknown as {
        EQUIPMENT_IMPORT_QUEUE: {
          sendBatch: (messages: Array<{ body: unknown }>) => Promise<unknown>;
        };
      }
    ).EQUIPMENT_IMPORT_QUEUE;

    const outcome = await enqueueEquipmentImport({
      supabase: supabaseAdmin,
      queue: queue as unknown as Parameters<
        typeof enqueueEquipmentImport
      >[0]["queue"],
      userId: user.id,
      products,
      subcategoryOverride,
    });

    if (outcome.status === "error") {
      Logger.error(
        "admin.import.enqueue.failed",
        createLogContext("admin-import", { userId: user.id }),
        new Error(outcome.message)
      );
      return data<ActionResult>(
        { intent: "import", error: outcome.message },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    if (outcome.chunkErrors.length > 0) {
      Logger.error(
        "admin.import.enqueue.chunk-errors",
        createLogContext("admin-import", {
          jobId: outcome.jobId,
          enqueued: outcome.enqueued,
        }),
        new Error(outcome.chunkErrors.join("; "))
      );
    }

    throw redirect(`/admin/import/jobs/${outcome.jobId}`, {
      headers: sbServerClient.headers,
    });
  }

  return data<ActionResult>(
    { intent: "fetch", products: [], fetchError: "Unknown action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

export default function AdminImportIndex({ loaderData }: Route.ComponentProps) {
  const { category, existingSlugs, existingCount, csrfToken } = loaderData;
  const fetcher = useFetcher<ActionResult>();
  const navigation = useNavigation();

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(
    category === "rubber"
      ? "inverted"
      : category === "pips_short"
        ? "short_pips"
        : category === "pips_medium"
          ? "medium_pips"
          : category === "pips_long"
            ? "long_pips"
            : category === "anti"
              ? "anti"
              : ""
  );

  const fetcherData = fetcher.data;
  const isFetching =
    fetcher.state === "submitting" || fetcher.state === "loading";
  // Import is fire-and-forget — the action throws redirect, so as soon
  // as it completes we'll be on /admin/import/jobs/:jobId. The button
  // only needs to lock for the brief moment between click and 302.
  const isEnqueuing =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "import";

  const fetched: RevspinProductWithSlug[] =
    fetcherData?.intent === "fetch" ? fetcherData.products : [];
  const fetchError =
    fetcherData?.intent === "fetch" ? fetcherData.fetchError : null;

  // Hide already-imported rows entirely; the operator only cares
  // about what they can still import. Count is surfaced in the header
  // so they can sanity-check that "we already have most of these".
  const existingSlugSet = new Set(existingSlugs);
  const availableProducts = fetched.filter(
    p => !existingSlugSet.has(p.generatedSlug)
  );
  const alreadyImportedCount = fetched.length - availableProducts.length;

  function toggleProduct(slug: string) {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function selectAll() {
    setSelectedProducts(new Set(availableProducts.map(p => p.slug)));
  }

  function clearSelection() {
    setSelectedProducts(new Set());
  }

  const selectedPayload: RevspinProduct[] = availableProducts.filter(p =>
    selectedProducts.has(p.slug)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Import Equipment from Revspin
          </h2>
          <p className="text-gray-600 mt-1 text-sm">
            Browse revspin.net by category and queue an import. The work runs in
            the background — you can leave this page once a run has started.
          </p>
        </div>
        <div className="text-right text-sm text-gray-500 shrink-0">
          <div data-testid="admin-import-existing-count">
            {existingCount} in catalogue
          </div>
          <Link
            to="/admin/import/jobs"
            className="text-purple-600 hover:text-purple-800"
            data-testid="admin-import-recent-jobs-link"
          >
            View recent imports →
          </Link>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 overflow-x-auto">
          {(Object.entries(CATEGORY_LABELS) as [RevspinCategory, string][]).map(
            ([key, label]) => (
              <Link
                key={key}
                to={`/admin/import?category=${key}`}
                onClick={() => setSelectedProducts(new Set())}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  category === key
                    ? "border-purple-500 text-purple-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {label}
              </Link>
            )
          )}
        </nav>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Fetch {CATEGORY_LABELS[category]} from Revspin
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Loads the current list from revspin.net. Items already in the
              catalogue are filtered out.
            </p>
          </div>
          <fetcher.Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="intent" value="fetch" />
            <input type="hidden" name="category" value={category} />
            <button
              type="submit"
              disabled={isFetching}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid="admin-import-fetch-button"
            >
              {isFetching ? "Fetching…" : "Fetch from Revspin"}
            </button>
          </fetcher.Form>
        </div>

        {isFetching && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Fetching products from revspin.net…</span>
            </div>
          </div>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            Error fetching from revspin: {fetchError}
          </p>
        </div>
      )}

      {fetched.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-4 bg-gray-50 p-4 rounded-lg flex-wrap">
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={selectAll}
                className="text-purple-600 hover:text-purple-800"
                data-testid="admin-import-select-all"
              >
                Select all ({availableProducts.length})
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-gray-600 hover:text-gray-800"
                data-testid="admin-import-clear-selection"
              >
                Clear selection
              </button>
              <span
                className="text-gray-500"
                data-testid="admin-import-selected-count"
              >
                {selectedProducts.size} selected
              </span>
              {alreadyImportedCount > 0 && (
                <span
                  className="text-gray-400"
                  data-testid="admin-import-already-imported-count"
                >
                  · {alreadyImportedCount} already in catalogue (hidden)
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {category !== "blade" && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="subcategory"
                    className="text-sm text-gray-600"
                  >
                    Type:
                  </label>
                  <select
                    id="subcategory"
                    value={selectedSubcategory}
                    onChange={e => setSelectedSubcategory(e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
                  >
                    <option value="inverted">Inverted</option>
                    <option value="short_pips">Short Pips</option>
                    <option value="medium_pips">Medium Pips</option>
                    <option value="long_pips">Long Pips</option>
                    <option value="anti">Anti-Spin</option>
                  </select>
                </div>
              )}

              <Form method="post">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input type="hidden" name="intent" value="import" />
                <input
                  type="hidden"
                  name="products"
                  value={JSON.stringify(selectedPayload)}
                />
                {category !== "blade" && (
                  <input
                    type="hidden"
                    name="subcategory"
                    value={selectedSubcategory}
                  />
                )}
                <button
                  type="submit"
                  disabled={selectedProducts.size === 0 || isEnqueuing}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="admin-import-enqueue-button"
                >
                  {isEnqueuing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {isEnqueuing
                    ? "Queueing…"
                    : `Import ${selectedProducts.size} items`}
                </button>
              </Form>
            </div>
          </div>

          {availableProducts.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center text-sm text-gray-500">
              Every product fetched from this category is already in the
              catalogue. Switch tab to pick another category.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                      Select
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Manufacturer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Speed
                    </th>
                    {category !== "blade" && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Spin
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Control
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {availableProducts.map(product => (
                    <tr key={product.slug}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.slug)}
                          onChange={() => toggleProduct(product.slug)}
                          className="h-4 w-4 text-purple-600 rounded border-gray-300"
                          aria-label={`Select ${product.name}`}
                          data-testid={`admin-import-row-${product.slug}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <a
                          href={product.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-purple-600"
                        >
                          {product.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {product.manufacturer}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {(product.specifications.speed as number)?.toFixed(1) ||
                          "-"}
                      </td>
                      {category !== "blade" && (
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {(product.specifications.spin as number)?.toFixed(
                            1
                          ) || "-"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {(product.specifications.control as number)?.toFixed(
                          1
                        ) ||
                          (product.specifications.stiffness as number)?.toFixed(
                            1
                          ) ||
                          "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {(product.specifications.overall as number)?.toFixed(
                          1
                        ) || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!isFetching && fetched.length === 0 && !fetchError && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            Click &ldquo;Fetch from Revspin&rdquo; to load{" "}
            {CATEGORY_LABELS[category].toLowerCase()}.
          </p>
        </div>
      )}
    </div>
  );
}

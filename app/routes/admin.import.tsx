import type { Route } from "./+types/admin.import";
import { useState } from "react";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { data, redirect, useFetcher } from "react-router";
import {
  fetchProductList,
  listItemToProduct,
  generateSlug,
  type RevspinCategory,
  type RevspinProduct,
} from "~/lib/revspin.server";

// Product with generated slug included (for client-side use)
type RevspinProductWithSlug = RevspinProduct & { generatedSlug: string };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Import Equipment | Admin | TT Reviews" },
    {
      name: "description",
      content: "Import equipment from revspin.net into TT Reviews database.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  if (user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  // Get category from URL params
  const url = new URL(request.url);
  const category = (url.searchParams.get("category") ||
    "blade") as RevspinCategory;

  // Fetch existing equipment count (but don't fetch from revspin yet)
  const supabase = createSupabaseAdminClient(context);
  const { data: existingEquipment } = await supabase
    .from("equipment")
    .select("slug");

  const existingSlugs = (existingEquipment || []).map(
    (e: { slug: string }) => e.slug
  );

  return data(
    {
      user,
      category,
      existingSlugs,
      existingCount: existingSlugs.length,
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user || user.role !== "admin") {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Fetch products from revspin
  if (intent === "fetch") {
    const category = formData.get("category") as RevspinCategory;

    try {
      const revspinProducts = await fetchProductList(category);
      const products = revspinProducts
        .map((item) => {
          const product = listItemToProduct(item, category);
          if (!product) return null;
          return {
            ...product,
            generatedSlug: generateSlug(product.name),
          };
        })
        .filter((p): p is RevspinProductWithSlug => p !== null);

      return data({ intent: "fetch", products, fetchError: null });
    } catch (error) {
      return data({
        intent: "fetch",
        products: [],
        fetchError:
          error instanceof Error ? error.message : "Failed to fetch products",
      });
    }
  }

  // Import selected products
  if (intent === "import") {
    const productsJson = formData.get("products") as string;
    const subcategoryOverride = formData.get("subcategory") as string | null;
    const products: RevspinProduct[] = JSON.parse(productsJson);

    const supabase = createSupabaseAdminClient(context);
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const product of products) {
      const slug = generateSlug(product.name);

      // Check if already exists
      const { data: existing } = await supabase
        .from("equipment")
        .select("id")
        .eq("slug", slug)
        .single();

      if (existing) {
        results.errors.push(`${product.name}: Already exists`);
        results.failed++;
        continue;
      }

      // Use override subcategory if provided, otherwise use product's subcategory
      const subcategory = subcategoryOverride || product.subcategory;

      // Insert the equipment
      const { error } = await supabase.from("equipment").insert({
        name: product.name,
        slug,
        manufacturer: product.manufacturer,
        category: product.category,
        subcategory,
        specifications: product.specifications,
      });

      if (error) {
        results.errors.push(`${product.name}: ${error.message}`);
        results.failed++;
      } else {
        results.success++;
      }
    }

    return data({ intent: "import", results });
  }

  return data({ error: "Unknown action" });
}

type ProductWithStatus = RevspinProductWithSlug & { alreadyImported: boolean };

export default function AdminImport({ loaderData }: Route.ComponentProps) {
  const { category, existingSlugs, existingCount } = loaderData;
  const fetcher = useFetcher();
  const importFetcher = useFetcher();

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(
    category === "rubber" ? "inverted" :
    category === "pips_short" ? "short_pips" :
    category === "pips_long" ? "long_pips" : ""
  );

  // Get products from fetcher data
  const fetcherData = fetcher.data as
    | { intent: "fetch"; products: RevspinProductWithSlug[]; fetchError: string | null }
    | undefined;
  const importData = importFetcher.data as
    | { intent: "import"; results: { success: number; failed: number; errors: string[] } }
    | undefined;

  const isFetching = fetcher.state === "submitting" || fetcher.state === "loading";
  const isImporting = importFetcher.state === "submitting";

  // Mark products with import status (using server-generated slug)
  const existingSlugSet = new Set(existingSlugs);
  const products: ProductWithStatus[] = (fetcherData?.products || []).map(
    (product) => ({
      ...product,
      alreadyImported: existingSlugSet.has(product.generatedSlug),
    })
  );

  const availableProducts = products.filter((p) => !p.alreadyImported);
  const importedProducts = products.filter((p) => p.alreadyImported);

  const toggleProduct = (slug: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(slug)) {
      newSelected.delete(slug);
    } else {
      newSelected.add(slug);
    }
    setSelectedProducts(newSelected);
  };

  const selectAll = () => {
    setSelectedProducts(new Set(availableProducts.map((p) => p.slug)));
  };

  const clearSelection = () => {
    setSelectedProducts(new Set());
  };

  const getSelectedProducts = (): RevspinProductWithSlug[] => {
    return availableProducts.filter((p) => selectedProducts.has(p.slug));
  };

  const categoryLabels: Record<RevspinCategory, string> = {
    blade: "Blades",
    rubber: "Rubbers (Inverted)",
    pips_short: "Short Pips",
    pips_long: "Long Pips",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Import Equipment from Revspin
          </h2>
          <p className="text-gray-600 mt-1">
            Browse equipment from revspin.net and import into your database.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {existingCount} equipment items in database
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {(
            Object.entries(categoryLabels) as [RevspinCategory, string][]
          ).map(([key, label]) => (
            <a
              key={key}
              href={`/admin/import?category=${key}`}
              onClick={() => {
                // Clear products when switching categories
                setSelectedProducts(new Set());
              }}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                category === key
                  ? "border-purple-500 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* Fetch Button */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Fetch {categoryLabels[category]} from Revspin
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Click the button to fetch the latest products from revspin.net
            </p>
          </div>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="fetch" />
            <input type="hidden" name="category" value={category} />
            <button
              type="submit"
              disabled={isFetching}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isFetching ? "Fetching..." : "Fetch from Revspin"}
            </button>
          </fetcher.Form>
        </div>

        {/* Progress Bar - Animated indeterminate */}
        {isFetching && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Fetching products from revspin.net...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-purple-600 h-2.5 rounded-full"
                style={{
                  width: "30%",
                  animation: "indeterminate 1.5s infinite ease-in-out",
                }}
              />
            </div>
            <style>{`
              @keyframes indeterminate {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
              }
            `}</style>
            <p className="text-xs text-gray-500 mt-2">
              This may take a few seconds depending on the category size.
            </p>
          </div>
        )}
      </div>

      {/* Fetch Error */}
      {fetcherData?.fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            Error fetching from revspin: {fetcherData.fetchError}
          </p>
        </div>
      )}

      {/* Import Results */}
      {importData?.results && (
        <div
          className={`p-4 rounded-lg ${
            importData.results.failed > 0
              ? "bg-yellow-50 border border-yellow-200"
              : "bg-green-50 border border-green-200"
          }`}
        >
          <h3 className="font-medium">Import Results</h3>
          <p>
            Successfully imported: {importData.results.success} | Failed:{" "}
            {importData.results.failed}
          </p>
          {importData.results.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-gray-600">
                View errors
              </summary>
              <ul className="mt-2 text-sm text-red-600">
                {importData.results.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Products Section - Only show after fetch */}
      {products.length > 0 && (
        <>
          {/* Selection Controls */}
          {availableProducts.length > 0 && (
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sm text-purple-600 hover:text-purple-800"
                >
                  Select All ({availableProducts.length})
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear Selection
                </button>
                <span className="text-sm text-gray-500">
                  {selectedProducts.size} selected
                </span>
              </div>

              <div className="flex items-center space-x-4">
                {/* Subcategory selector for rubbers */}
                {category !== "blade" && (
                  <div className="flex items-center space-x-2">
                    <label htmlFor="subcategory" className="text-sm text-gray-600">
                      Type:
                    </label>
                    <select
                      id="subcategory"
                      value={selectedSubcategory}
                      onChange={(e) => setSelectedSubcategory(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
                    >
                      <option value="inverted">Inverted</option>
                      <option value="short_pips">Short Pips</option>
                      <option value="long_pips">Long Pips</option>
                      <option value="anti">Anti-Spin</option>
                    </select>
                  </div>
                )}

                <importFetcher.Form method="post">
                  <input type="hidden" name="intent" value="import" />
                  <input
                    type="hidden"
                    name="products"
                    value={JSON.stringify(getSelectedProducts())}
                  />
                  {category !== "blade" && (
                    <input type="hidden" name="subcategory" value={selectedSubcategory} />
                  )}
                  <button
                    type="submit"
                    disabled={selectedProducts.size === 0 || isImporting}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting
                      ? "Importing..."
                      : `Import ${selectedProducts.size} Items`}
                  </button>
                </importFetcher.Form>
              </div>
            </div>
          )}

          {/* Products Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr
                    key={product.slug}
                    className={
                      product.alreadyImported ? "bg-gray-50 opacity-60" : ""
                    }
                  >
                    <td className="px-4 py-3">
                      {!product.alreadyImported && (
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.slug)}
                          onChange={() => toggleProduct(product.slug)}
                          className="h-4 w-4 text-purple-600 rounded border-gray-300"
                        />
                      )}
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
                        {(product.specifications.spin as number)?.toFixed(1) ||
                          "-"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(product.specifications.control as number)?.toFixed(1) ||
                        (product.specifications.stiffness as number)?.toFixed(
                          1
                        ) ||
                        "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(product.specifications.overall as number)?.toFixed(1) ||
                        "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {product.alreadyImported ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Imported
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Available
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="text-sm text-gray-500">
            Showing {products.length} products from revspin.net |{" "}
            {importedProducts.length} already imported |{" "}
            {availableProducts.length} available to import
          </div>
        </>
      )}

      {/* Empty state before fetch */}
      {!isFetching && products.length === 0 && !fetcherData?.fetchError && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            Click "Fetch from Revspin" to load {categoryLabels[category].toLowerCase()}.
          </p>
        </div>
      )}
    </div>
  );
}

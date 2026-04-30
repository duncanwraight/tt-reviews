import type { Route } from "./+types/equipment.compare._index";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { ComparisonHeader } from "~/components/equipment/ComparisonHeader";
import { SpecsTable } from "~/components/equipment/SpecsTable";
import { RatingsTable } from "~/components/equipment/RatingsTable";
import { ProUsageSidebar } from "~/components/equipment/ProUsageSidebar";

const MAX_IDS = 3;

function parseIds(raw: string | null): string[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  // Reject duplicates so the comparison columns stay distinct.
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function isSameSubcategory(
  e1: { category: string; subcategory?: string },
  e2: { category: string; subcategory?: string }
): boolean {
  if (e1.subcategory || e2.subcategory) {
    return e1.subcategory === e2.subcategory;
  }
  return e1.category === e2.category;
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.items) {
    return [
      { title: "Equipment Comparison | TT Reviews" },
      { name: "robots", content: "noindex, follow" },
    ];
  }
  const names = data.items.map(({ equipment }) => equipment.name).join(" vs ");
  return [
    { title: `${names} - Detailed Comparison | TT Reviews` },
    { name: "robots", content: "noindex, follow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);

  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get("ids"));

  if (!ids || ids.length < 2 || ids.length > MAX_IDS) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }

  const sorted = [...ids].sort((a, b) => a.localeCompare(b));

  // 2 ids: canonical home is the slug-pair route. 302 there.
  if (sorted.length === 2) {
    throw redirect(`/equipment/compare/${sorted[0]}-vs-${sorted[1]}`, {
      headers: sbServerClient.headers,
    });
  }

  const db = new DatabaseService(context);
  const equipmentList = await Promise.all(
    sorted.map(slug => db.getEquipment(slug))
  );

  if (equipmentList.some(e => !e)) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }
  const resolved = equipmentList as NonNullable<
    (typeof equipmentList)[number]
  >[];

  const first = resolved[0];
  if (!resolved.every(e => isSameSubcategory(first, e))) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }

  const categoryService = createCategoryService(sbServerClient.client);

  const [reviewsList, usedByList, specFields, ratingCategories] =
    await Promise.all([
      Promise.all(resolved.map(e => db.getEquipmentReviews(e.id, "approved"))),
      Promise.all(resolved.map(e => db.getPlayersUsingEquipment(e.id))),
      categoryService.getEquipmentSpecFields(first.category, first.subcategory),
      categoryService.getReviewRatingCategories(
        first.category,
        first.subcategory
      ),
    ]);

  const averageOf = (list: { overall_rating: number }[]) =>
    list.length === 0
      ? 0
      : list.reduce((sum, r) => sum + r.overall_rating, 0) / list.length;

  const items = resolved.map((equipment, i) => {
    const reviews = reviewsList[i];
    return {
      equipment,
      averageRating: averageOf(reviews),
      reviewCount: reviews.length,
      reviews,
      usedByPlayers: usedByList[i],
    };
  });

  return data(
    { items, specFields, ratingCategories },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentCompareThree({
  loaderData,
}: Route.ComponentProps) {
  const { items, specFields, ratingCategories } = loaderData;

  const heading = items.map(({ equipment }) => equipment.name).join(" vs ");

  return (
    <>
      <PageSection>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Equipment", href: "/equipment" },
            { label: heading },
          ]}
        />
      </PageSection>

      <PageSection>
        <ComparisonHeader items={items} />
      </PageSection>

      <PageSection>
        <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-8">
            <section aria-labelledby="specs-heading">
              <h2
                id="specs-heading"
                className="text-xl font-semibold text-gray-900"
              >
                Manufacturer specifications
              </h2>
              <p className="mt-1 mb-3 text-sm text-gray-500">
                Manufacturer-published values for marketing — speed/spin/control
                ratings aren't directly comparable across brands.
              </p>
              <SpecsTable items={items} specFields={specFields} />
            </section>

            <section aria-labelledby="ratings-heading">
              <h2
                id="ratings-heading"
                className="mb-3 text-xl font-semibold text-gray-900"
              >
                Community ratings
              </h2>
              <RatingsTable items={items} ratingCategories={ratingCategories} />
            </section>
          </div>

          <aside aria-labelledby="pro-usage-heading">
            <h2
              id="pro-usage-heading"
              className="mb-3 text-xl font-semibold text-gray-900"
            >
              Used by pros
            </h2>
            <ProUsageSidebar items={items} />
          </aside>
        </div>
      </PageSection>

      {/* Spacer so the sticky tray doesn't overlap the page content. */}
      <div aria-hidden className="h-28 sm:h-24" />
    </>
  );
}

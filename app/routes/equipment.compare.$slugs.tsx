import type { Route } from "./+types/equipment.compare.$slugs";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { createCategoryService } from "~/lib/categories.server";
import { schemaService } from "~/lib/schema";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { ComparisonHeader } from "~/components/equipment/ComparisonHeader";
import { SpecsTable } from "~/components/equipment/SpecsTable";
import { RatingsTable } from "~/components/equipment/RatingsTable";
import { ProUsageSidebar } from "~/components/equipment/ProUsageSidebar";
import { StructuredData } from "~/components/seo/StructuredData";
import { buildCanonicalUrl, getSiteUrl } from "~/lib/seo";

function parseSlugs(raw: string | undefined): [string, string] | null {
  if (!raw) return null;
  const parts = raw.split("-vs-");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b || a === b) return null;
  return [a, b];
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

export function meta({ data, matches, location }: Route.MetaArgs) {
  if (!data?.equipment1 || !data?.equipment2) {
    return [{ title: "Equipment Comparison | TT Reviews" }];
  }
  const {
    equipment1,
    equipment2,
    averageRating1,
    averageRating2,
    reviewCount1,
    reviewCount2,
  } = data;

  const canonical = buildCanonicalUrl(
    getSiteUrl(matches),
    location.pathname,
    ""
  );
  const title = `${equipment1.name} vs ${equipment2.name} - Detailed Comparison | TT Reviews`;

  const ratingFragment = (name: string, avg: number, count: number) =>
    count > 0
      ? `${name} (${avg.toFixed(1)}★ from ${count} review${count === 1 ? "" : "s"})`
      : `${name} (no reviews yet)`;

  const description = `Compare ${ratingFragment(equipment1.name, averageRating1, reviewCount1)} against ${ratingFragment(equipment2.name, averageRating2, reviewCount2)}. Side-by-side specs and community ratings.`;

  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow" },
    { tagName: "link", rel: "canonical", href: canonical },
    {
      property: "og:title",
      content: `${equipment1.name} vs ${equipment2.name}`,
    },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: "TT Reviews" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);

  const slugs = parseSlugs(params.slugs);
  if (!slugs) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }
  const [rawA, rawB] = slugs;

  // Canonical: alphabetical slug order. If reversed, 301 to the canonical URL.
  const [canonA, canonB] = [rawA, rawB].sort((x, y) => x.localeCompare(y));
  if (rawA !== canonA) {
    throw redirect(`/equipment/compare/${canonA}-vs-${canonB}`, {
      status: 301,
      headers: sbServerClient.headers,
    });
  }

  const db = new DatabaseService(context);
  const [equipment1, equipment2] = await Promise.all([
    db.getEquipment(canonA),
    db.getEquipment(canonB),
  ]);

  if (!equipment1 || !equipment2) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }

  if (!isSameSubcategory(equipment1, equipment2)) {
    throw redirect("/equipment", { headers: sbServerClient.headers });
  }

  const categoryService = createCategoryService(sbServerClient.client);

  const [
    reviews1,
    reviews2,
    usedByPlayers1,
    usedByPlayers2,
    specFields,
    ratingCategories,
  ] = await Promise.all([
    db.getEquipmentReviews(equipment1.id, "approved"),
    db.getEquipmentReviews(equipment2.id, "approved"),
    db.getPlayersUsingEquipment(equipment1.id),
    db.getPlayersUsingEquipment(equipment2.id),
    categoryService.getEquipmentSpecFields(
      equipment1.category,
      equipment1.subcategory
    ),
    categoryService.getReviewRatingCategories(
      equipment1.category,
      equipment1.subcategory
    ),
  ]);

  const averageOf = (list: { overall_rating: number }[]) =>
    list.length === 0
      ? 0
      : list.reduce((sum, r) => sum + r.overall_rating, 0) / list.length;

  const averageRating1 = averageOf(reviews1);
  const averageRating2 = averageOf(reviews2);

  const comparisonSchema = schemaService.generateComparisonSchema({
    equipment1: {
      name: equipment1.name,
      slug: equipment1.slug,
      manufacturer: equipment1.manufacturer,
      category: equipment1.category,
      averageRating: averageRating1 > 0 ? averageRating1 : null,
      reviewCount: reviews1.length,
    },
    equipment2: {
      name: equipment2.name,
      slug: equipment2.slug,
      manufacturer: equipment2.manufacturer,
      category: equipment2.category,
      averageRating: averageRating2 > 0 ? averageRating2 : null,
      reviewCount: reviews2.length,
    },
    usedByPlayers1: usedByPlayers1.map(p => ({ name: p.name, slug: p.slug })),
    usedByPlayers2: usedByPlayers2.map(p => ({ name: p.name, slug: p.slug })),
  });

  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" },
    { label: `${equipment1.name} vs ${equipment2.name}` },
  ]);

  return data(
    {
      equipment1,
      equipment2,
      reviews1,
      reviews2,
      usedByPlayers1,
      usedByPlayers2,
      averageRating1,
      averageRating2,
      reviewCount1: reviews1.length,
      reviewCount2: reviews2.length,
      specFields,
      ratingCategories,
      multipleSchemas: [comparisonSchema, breadcrumbSchema],
    },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentCompare({ loaderData }: Route.ComponentProps) {
  const {
    equipment1,
    equipment2,
    reviews1,
    reviews2,
    usedByPlayers1,
    usedByPlayers2,
    averageRating1,
    averageRating2,
    reviewCount1,
    reviewCount2,
    specFields,
    ratingCategories,
    multipleSchemas,
  } = loaderData;

  const items = [
    {
      equipment: equipment1,
      averageRating: averageRating1,
      reviewCount: reviewCount1,
      reviews: reviews1,
      usedByPlayers: usedByPlayers1,
    },
    {
      equipment: equipment2,
      averageRating: averageRating2,
      reviewCount: reviewCount2,
      reviews: reviews2,
      usedByPlayers: usedByPlayers2,
    },
  ];

  return (
    <>
      <StructuredData schema={multipleSchemas} />
      <PageSection>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Equipment", href: "/equipment" },
            { label: `${equipment1.name} vs ${equipment2.name}` },
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

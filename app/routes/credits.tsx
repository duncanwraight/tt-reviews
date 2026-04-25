import type { Route } from "./+types/credits";
import { data } from "react-router";
import { Link } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { Logger, createLogContext } from "~/lib/logger.server";
import { buildImageUrl } from "~/lib/imageUrl";

interface CreditRow {
  slug: string;
  name: string;
  imageKey: string;
  imageEtag: string | null;
  creditText: string | null;
  creditLink: string | null;
  licenseShort: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

export function meta() {
  const title = "Image Credits | TT Reviews";
  const description =
    "Photo credits for player and equipment images on TT Reviews. " +
    "Includes creator attribution, license information, and links to sources.";
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "credits"
  );
  const sbServerClient = getServerClient(request, context);

  const { data: players, error } = await sbServerClient.client
    .from("players")
    .select(
      "slug, name, image_key, image_etag, image_credit_text, image_credit_link, image_license_short, image_license_url, image_source_url"
    )
    .not("image_credit_text", "is", null)
    .order("name", { ascending: true });

  if (error) {
    Logger.error("loader.credits.failed", ctx, error);
    throw new Response("Failed to load credits", { status: 500 });
  }

  const rows: CreditRow[] = (players ?? [])
    .filter(p => typeof p.image_key === "string")
    .map(p => ({
      slug: p.slug as string,
      name: p.name as string,
      imageKey: p.image_key as string,
      imageEtag: p.image_etag ?? null,
      creditText: p.image_credit_text ?? null,
      creditLink: p.image_credit_link ?? null,
      licenseShort: p.image_license_short ?? null,
      licenseUrl: p.image_license_url ?? null,
      sourceUrl: p.image_source_url ?? null,
    }));

  return data({ rows }, { headers: sbServerClient.headers });
}

export default function CreditsPage({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Credits", current: true },
        ]}
      />

      <PageSection>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Image Credits</h1>
        <p className="text-gray-600 mb-3 max-w-3xl">
          Player photographs are sourced from{" "}
          <a
            href="https://www.worldtabletennis.com/"
            rel="nofollow noreferrer noopener"
            className="underline hover:text-gray-900"
          >
            World Table Tennis
          </a>{" "}
          and Wikimedia Commons. Each credit below links to the original source.
          Where a Creative Commons license applies, it is shown so the work can
          be verified and reused under the same terms.
        </p>
        <p className="text-gray-600 mb-6 max-w-3xl text-sm">
          If you are a copyright holder and would like an image removed, please
          contact{" "}
          <a
            href="mailto:duncan@wraight-consulting.co.uk?subject=TT%20Reviews%20image%20takedown"
            className="underline hover:text-gray-900"
          >
            duncan@wraight-consulting.co.uk
          </a>{" "}
          with the player name and source URL and we will remove it promptly.
        </p>

        {rows.length === 0 ? (
          <p className="text-gray-600">No credits to display yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
            {rows.map(row => (
              <li
                key={`${row.imageKey}-${row.slug}`}
                className="flex items-start gap-4 p-4"
              >
                <img
                  src={buildImageUrl(row.imageKey, row.imageEtag) ?? ""}
                  alt={row.name}
                  className="w-16 h-16 object-cover object-top rounded flex-shrink-0"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/players/${row.slug}`}
                    className="text-lg font-medium text-purple-700 hover:text-purple-900"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-gray-700 mt-1">
                    Photo by{" "}
                    {row.creditLink && row.creditText ? (
                      <a
                        href={row.creditLink}
                        rel="nofollow noreferrer noopener"
                        className="underline hover:text-gray-900"
                      >
                        {row.creditText}
                      </a>
                    ) : (
                      <span>{row.creditText ?? "Unknown"}</span>
                    )}
                    {row.licenseShort ? (
                      <>
                        {" "}
                        ·{" "}
                        {row.licenseUrl ? (
                          <a
                            href={row.licenseUrl}
                            rel="nofollow noreferrer noopener"
                            className="underline hover:text-gray-900"
                          >
                            {row.licenseShort}
                          </a>
                        ) : (
                          <span>{row.licenseShort}</span>
                        )}
                      </>
                    ) : null}
                    {row.sourceUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={row.sourceUrl}
                          rel="nofollow noreferrer noopener"
                          className="underline hover:text-gray-900"
                        >
                          source
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </div>
  );
}

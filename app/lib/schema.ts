// Schema markup utility service for SEO structured data
// Based on schema.org specifications and Google's rich results guidelines

export interface SchemaOrganization {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  contactPoint?: {
    "@type": "ContactPoint";
    contactType: string;
    url?: string;
  };
}

export interface SchemaPerson {
  "@context": "https://schema.org";
  "@type": "Person";
  name: string;
  url: string;
  description?: string;
  nationality?: string;
  sport?: string;
  knowsAbout?: string[];
  sameAs?: string[];
}

export interface SchemaPropertyValue {
  "@type": "PropertyValue";
  name: string;
  value?: string | number;
  minValue?: number;
  maxValue?: number;
  unitText?: string;
}

export interface SchemaProduct {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description: string;
  brand: {
    "@type": "Brand";
    name: string;
  };
  category: string;
  url: string;
  image?: string;
  material?: string;
  weight?: {
    "@type": "QuantitativeValue";
    value: number;
    unitCode: "GRM";
  };
  additionalProperty?: SchemaPropertyValue[];
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
    bestRating: number;
    worstRating: number;
  };
  review?: SchemaReview[];
}

export interface SchemaReview {
  "@context"?: "https://schema.org";
  "@type": "Review";
  reviewRating: {
    "@type": "Rating";
    ratingValue: number;
    bestRating: number;
    worstRating: number;
  };
  author: {
    "@type": "Person";
    name: string;
  };
  reviewBody: string;
  datePublished: string;
  itemReviewed: {
    "@type": "Product";
    name: string;
  };
}

export interface SchemaBreadcrumbList {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    // Optional on the last "current page" entry — Google's
    // BreadcrumbList spec allows omitting `item` there, and we
    // prefer that to the previous bug of falling back to the
    // bare baseUrl when href was undefined.
    item?: string;
  }[];
}

export interface SchemaWebSite {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
  description: string;
  potentialAction: {
    "@type": "SearchAction";
    target: string;
    "query-input": string;
  };
}

// Per `archive/EQUIPMENT-SPECS.md`, `range`-typed spec fields store
// `{min, max}`. Used by generateEquipmentSchema to map them onto
// PropertyValue.minValue/maxValue.
function isRangeValue(value: unknown): value is { min: number; max: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "min" in value &&
    "max" in value &&
    typeof (value as { min: unknown }).min === "number" &&
    typeof (value as { max: unknown }).max === "number"
  );
}

export class SchemaService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || "https://tabletennis.reviews";
  }

  // Organization schema for the main site
  generateOrganizationSchema(): SchemaOrganization {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "TT Reviews",
      url: this.baseUrl,
      description:
        "Professional table tennis equipment reviews and player database",
      logo: `${this.baseUrl}/logo.png`,
      sameAs: [
        // Add social media URLs when available
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        url: `${this.baseUrl}/contact`,
      },
    };
  }

  // Website schema with search action
  generateWebSiteSchema(): SchemaWebSite {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "TT Reviews",
      url: this.baseUrl,
      description:
        "Professional table tennis equipment reviews and player database",
      potentialAction: {
        "@type": "SearchAction",
        target: `${this.baseUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    };
  }

  // Player schema (Person type)
  generatePlayerSchema(player: {
    name: string;
    slug: string;
    birth_country?: string;
    represents?: string;
    playing_style?: string;
    bio?: string;
  }): SchemaPerson {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      name: player.name,
      url: `${this.baseUrl}/players/${player.slug}`,
      description:
        player.bio || `Professional table tennis player ${player.name}`,
      nationality: player.birth_country || player.represents || undefined,
      sport: "Table Tennis",
      knowsAbout: [
        "Table Tennis",
        "Professional Table Tennis",
        player.playing_style || "Table Tennis Equipment",
      ].filter(Boolean),
    };
  }

  // Equipment schema (Product type).
  //
  // A piece of equipment in our model has up to two information
  // sources: manufacturer specifications (locked in
  // `archive/EQUIPMENT-SPECS.md`) and community reviews. Both are
  // optional — emit whichever is present:
  //
  //   - reviews only            → Product with image + aggregateRating + review[]
  //   - specs only              → Product with image + additionalProperty[]
  //   - both                    → Product with all of the above
  //   - neither (and no image)  → null (caller renders BreadcrumbList only)
  //
  // Returning null lets the route opt out of emitting a Product
  // schema entirely when there's nothing substantive to say —
  // emitting a bare Product with just name/brand/url was triggering
  // Google's Rich Results validator with ERROR severity and was the
  // dominant signal blocking indexation pre-fix (TT-193 audit).
  generateEquipmentSchema(equipment: {
    name: string;
    slug: string;
    manufacturer: string;
    category: string;
    description?: string;
    image?: string;
    specifications?: Record<string, unknown> | null;
    averageRating?: number;
    reviewCount?: number;
    reviews?: Array<{
      id: string;
      overall_rating: number;
      review_text?: string;
      created_at: string;
      user?: { name: string };
    }>;
  }): SchemaProduct | null {
    const hasReviews = (equipment.reviews?.length ?? 0) > 0;
    const specEntries = equipment.specifications
      ? Object.entries(equipment.specifications).filter(
          ([, value]) => value !== null && value !== undefined && value !== ""
        )
      : [];
    const hasSpecs = specEntries.length > 0;

    if (!hasReviews && !hasSpecs) {
      return null;
    }

    const schema: SchemaProduct = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: equipment.name,
      description:
        equipment.description ||
        `${equipment.name} ${equipment.category} by ${equipment.manufacturer}`,
      brand: {
        "@type": "Brand",
        name: equipment.manufacturer,
      },
      category: equipment.category,
      url: `${this.baseUrl}/equipment/${equipment.slug}`,
    };

    if (equipment.image) {
      schema.image = equipment.image;
    }

    // Map typed `equipment.specifications` JSONB (see EQUIPMENT-SPECS.md)
    // into Product fields. `material` and `weight` get first-class
    // schema.org slots; everything else becomes additionalProperty
    // (PropertyValue). Range values use minValue/maxValue.
    if (hasSpecs) {
      const extra: SchemaPropertyValue[] = [];
      for (const [key, value] of specEntries) {
        if (key === "material" && typeof value === "string") {
          schema.material = value;
          continue;
        }
        if (key === "weight" && typeof value === "number") {
          schema.weight = {
            "@type": "QuantitativeValue",
            value,
            unitCode: "GRM",
          };
          continue;
        }
        if (isRangeValue(value)) {
          extra.push({
            "@type": "PropertyValue",
            name: key,
            minValue: value.min,
            maxValue: value.max,
          });
          continue;
        }
        if (typeof value === "string" || typeof value === "number") {
          extra.push({ "@type": "PropertyValue", name: key, value });
        }
      }
      if (extra.length > 0) {
        schema.additionalProperty = extra;
      }
    }

    if (hasReviews && equipment.averageRating && equipment.reviewCount) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: equipment.averageRating,
        reviewCount: equipment.reviewCount,
        bestRating: 5,
        worstRating: 1,
      };
    }

    // Cap at top 5 reviews — both schema.org best practice and a
    // payload-size guard for pages with hundreds of reviews.
    if (hasReviews && equipment.reviews) {
      schema.review = equipment.reviews.slice(0, 5).map(review => ({
        "@type": "Review",
        reviewRating: {
          "@type": "Rating",
          ratingValue: review.overall_rating,
          bestRating: 5,
          worstRating: 1,
        },
        author: {
          "@type": "Person",
          name: review.user?.name || "Anonymous Reviewer",
        },
        reviewBody: review.review_text || "",
        datePublished: review.created_at,
        itemReviewed: {
          "@type": "Product",
          name: equipment.name,
        },
      }));
    }

    return schema;
  }

  // Breadcrumb schema. The final "current page" entry typically has
  // no `href` — Google's spec allows (and prefers) omitting `item`
  // there. The previous behaviour fell back to the bare baseUrl,
  // which made every detail-page breadcrumb's last entry point at
  // the home page (visible in Rich Results inspector as the
  // "Unnamed item" warning on /equipment/:slug).
  generateBreadcrumbSchema(
    breadcrumbs: Array<{ label: string; href?: string }>
  ): SchemaBreadcrumbList {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, index) => {
        const listItem: SchemaBreadcrumbList["itemListElement"][number] = {
          "@type": "ListItem",
          position: index + 1,
          name: crumb.label,
        };
        if (crumb.href) {
          listItem.item = `${this.baseUrl}${crumb.href}`;
        }
        return listItem;
      }),
    };
  }

  // Review schema (standalone)
  generateReviewSchema(review: {
    id: string;
    overall_rating: number;
    review_text: string;
    created_at: string;
    user: { name: string };
    equipment: { name: string; slug: string };
  }): SchemaReview {
    return {
      "@context": "https://schema.org",
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.overall_rating,
        bestRating: 5,
        worstRating: 1,
      },
      author: {
        "@type": "Person",
        name: review.user.name,
      },
      reviewBody: review.review_text,
      datePublished: review.created_at,
      itemReviewed: {
        "@type": "Product",
        name: review.equipment.name,
      },
    };
  }

  // Utility to convert schema object to JSON-LD script tag.
  // Escapes `<` to < so a review body containing "</script>..."
  // cannot break out of the <script type="application/ld+json"> block.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toJsonLd(schema: any): string {
    return JSON.stringify(schema, null, 2).replace(/</g, "\\u003c");
  }

  // Comparison schema for equipment comparison pages
  generateComparisonSchema(data: {
    equipment1: {
      name: string;
      slug: string;
      manufacturer: string;
      category: string;
      averageRating?: number | null;
      reviewCount: number;
    };
    equipment2: {
      name: string;
      slug: string;
      manufacturer: string;
      category: string;
      averageRating?: number | null;
      reviewCount: number;
    };
    usedByPlayers1: Array<{ name: string; slug: string }>;
    usedByPlayers2: Array<{ name: string; slug: string }>;
  }) {
    return {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${data.equipment1.name} vs ${data.equipment2.name} Comparison`,
      description: `Detailed comparison between ${data.equipment1.name} and ${data.equipment2.name} table tennis equipment`,
      url: `${this.baseUrl}/equipment/compare/${data.equipment1.slug}-vs-${data.equipment2.slug}`,
      about: [
        {
          "@type": "Product",
          name: data.equipment1.name,
          brand: { "@type": "Brand", name: data.equipment1.manufacturer },
          category: data.equipment1.category,
          url: `${this.baseUrl}/equipment/${data.equipment1.slug}`,
          ...(data.equipment1.averageRating &&
            data.equipment1.reviewCount > 0 && {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: data.equipment1.averageRating,
                reviewCount: data.equipment1.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }),
        },
        {
          "@type": "Product",
          name: data.equipment2.name,
          brand: { "@type": "Brand", name: data.equipment2.manufacturer },
          category: data.equipment2.category,
          url: `${this.baseUrl}/equipment/${data.equipment2.slug}`,
          ...(data.equipment2.averageRating &&
            data.equipment2.reviewCount > 0 && {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: data.equipment2.averageRating,
                reviewCount: data.equipment2.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }),
        },
      ],
      mainEntity: {
        "@type": "ItemList",
        name: "Equipment Comparison",
        numberOfItems: 2,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            item: {
              "@type": "Product",
              name: data.equipment1.name,
              url: `${this.baseUrl}/equipment/${data.equipment1.slug}`,
            },
          },
          {
            "@type": "ListItem",
            position: 2,
            item: {
              "@type": "Product",
              name: data.equipment2.name,
              url: `${this.baseUrl}/equipment/${data.equipment2.slug}`,
            },
          },
        ],
      },
    };
  }

  // Generate multiple schemas as array (for pages with multiple schema types).
  // Same `<` escape as toJsonLd.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateMultipleSchemas(schemas: any[]): string {
    return JSON.stringify(schemas, null, 2).replace(/</g, "\\u003c");
  }
}

// Export singleton instance
export const schemaService = new SchemaService();

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
    item: string;
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

export class SchemaService {
  private baseUrl: string;

  constructor(baseUrl: string = "https://tabletennis.reviews") {
    this.baseUrl = baseUrl;
  }

  // Organization schema for the main site
  generateOrganizationSchema(): SchemaOrganization {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "TT Reviews",
      url: this.baseUrl,
      description: "Professional table tennis equipment reviews and player database",
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
      description: "Professional table tennis equipment reviews and player database",
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
      description: player.bio || `Professional table tennis player ${player.name}`,
      nationality: player.birth_country || player.represents || undefined,
      sport: "Table Tennis",
      knowsAbout: [
        "Table Tennis",
        "Professional Table Tennis",
        player.playing_style || "Table Tennis Equipment",
      ].filter(Boolean),
    };
  }

  // Equipment schema (Product type)
  generateEquipmentSchema(equipment: {
    name: string;
    slug: string;
    manufacturer: string;
    category: string;
    description?: string;
    averageRating?: number;
    reviewCount?: number;
    reviews?: Array<{
      id: string;
      overall_rating: number;
      review_text: string;
      created_at: string;
      user: { name: string };
    }>;
  }): SchemaProduct {
    const schema: SchemaProduct = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: equipment.name,
      description: equipment.description || `${equipment.name} ${equipment.category} by ${equipment.manufacturer}`,
      brand: {
        "@type": "Brand",
        name: equipment.manufacturer,
      },
      category: equipment.category,
      url: `${this.baseUrl}/equipment/${equipment.slug}`,
    };

    // Add aggregate rating if available
    if (equipment.averageRating && equipment.reviewCount) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: equipment.averageRating,
        reviewCount: equipment.reviewCount,
        bestRating: 5,
        worstRating: 1,
      };
    }

    // Add individual reviews if available (limit to top 5 for performance)
    if (equipment.reviews && equipment.reviews.length > 0) {
      schema.review = equipment.reviews.slice(0, 5).map((review) => ({
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
          name: equipment.name,
        },
      }));
    }

    return schema;
  }

  // Breadcrumb schema
  generateBreadcrumbSchema(breadcrumbs: Array<{ label: string; href?: string }>): SchemaBreadcrumbList {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.label,
        item: crumb.href ? `${this.baseUrl}${crumb.href}` : `${this.baseUrl}`,
      })),
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

  // Utility to convert schema object to JSON-LD script tag
  toJsonLd(schema: any): string {
    return JSON.stringify(schema, null, 2);
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
          ...(data.equipment1.averageRating && data.equipment1.reviewCount > 0 && {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: data.equipment1.averageRating,
              reviewCount: data.equipment1.reviewCount,
              bestRating: 5,
              worstRating: 1,
            }
          })
        },
        {
          "@type": "Product",
          name: data.equipment2.name,
          brand: { "@type": "Brand", name: data.equipment2.manufacturer },
          category: data.equipment2.category,
          url: `${this.baseUrl}/equipment/${data.equipment2.slug}`,
          ...(data.equipment2.averageRating && data.equipment2.reviewCount > 0 && {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: data.equipment2.averageRating,
              reviewCount: data.equipment2.reviewCount,
              bestRating: 5,
              worstRating: 1,
            }
          })
        }
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
              url: `${this.baseUrl}/equipment/${data.equipment1.slug}`
            }
          },
          {
            "@type": "ListItem",
            position: 2,
            item: {
              "@type": "Product",
              name: data.equipment2.name,
              url: `${this.baseUrl}/equipment/${data.equipment2.slug}`
            }
          }
        ]
      }
    };
  }

  // Generate multiple schemas as array (for pages with multiple schema types)
  generateMultipleSchemas(schemas: any[]): string {
    return JSON.stringify(schemas, null, 2);
  }
}

// Export singleton instance
export const schemaService = new SchemaService();

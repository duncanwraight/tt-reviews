// Sitemap generation utility service
// Handles dynamic sitemap creation for all content types

export interface SitemapUrl {
  url: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

export interface SitemapEntry {
  url: string;
  lastmod: string;
}

export class SitemapService {
  public readonly baseUrl: string;

  constructor(baseUrl: string = "https://tabletennis.reviews") {
    this.baseUrl = baseUrl;
  }

  // Generate static pages sitemap entries
  generateStaticPages(): SitemapUrl[] {
    const now = new Date().toISOString();
    
    return [
      {
        url: `${this.baseUrl}/`,
        lastmod: now,
        changefreq: "daily",
        priority: "1.0",
      },
      {
        url: `${this.baseUrl}/players`,
        lastmod: now,
        changefreq: "daily",
        priority: "0.9",
      },
      {
        url: `${this.baseUrl}/equipment`,
        lastmod: now,
        changefreq: "daily",
        priority: "0.9",
      },
      {
        url: `${this.baseUrl}/search`,
        lastmod: now,
        changefreq: "weekly",
        priority: "0.7",
      },
      {
        url: `${this.baseUrl}/login`,
        lastmod: now,
        changefreq: "monthly",
        priority: "0.3",
      },
    ];
  }

  // Generate player pages sitemap entries
  generatePlayerPages(players: Array<{ slug: string; updated_at: string; active: boolean }>): SitemapUrl[] {
    return players
      .filter(player => player.active) // Only include active players
      .map(player => ({
        url: `${this.baseUrl}/players/${player.slug}`,
        lastmod: new Date(player.updated_at).toISOString(),
        changefreq: "weekly" as const,
        priority: "0.8",
      }));
  }

  // Generate equipment pages sitemap entries
  generateEquipmentPages(equipment: Array<{ slug: string; updated_at: string }>): SitemapUrl[] {
    return equipment.map(item => ({
      url: `${this.baseUrl}/equipment/${item.slug}`,
      lastmod: new Date(item.updated_at).toISOString(),
      changefreq: "weekly" as const,
      priority: "0.8",
    }));
  }

  // Generate category pages sitemap entries
  generateCategoryPages(categories: string[]): SitemapUrl[] {
    const now = new Date().toISOString();
    
    return categories.map(category => ({
      url: `${this.baseUrl}/equipment?category=${encodeURIComponent(category)}`,
      lastmod: now,
      changefreq: "daily" as const,
      priority: "0.7",
    }));
  }

  // Generate subcategory pages sitemap entries
  generateSubcategoryPages(
    categorySubcategories: Array<{ category: string; subcategory: string }>
  ): SitemapUrl[] {
    const now = new Date().toISOString();
    
    return categorySubcategories.map(({ category, subcategory }) => ({
      url: `${this.baseUrl}/equipment?category=${encodeURIComponent(category)}&subcategory=${encodeURIComponent(subcategory)}`,
      lastmod: now,
      changefreq: "daily" as const,
      priority: "0.6", // Slightly lower priority than main categories
    }));
  }

  // Generate manufacturer-specific pages for popular brands
  generateManufacturerPages(manufacturers: string[]): SitemapUrl[] {
    const now = new Date().toISOString();
    
    // Only include major manufacturers to avoid too many URLs
    const popularManufacturers = manufacturers.filter(manufacturer => 
      ['Butterfly', 'DHS', 'TIBHAR', 'Yasaka', 'STIGA', 'Xiom', 'Donic'].includes(manufacturer)
    );
    
    return popularManufacturers.map(manufacturer => ({
      url: `${this.baseUrl}/equipment?manufacturer=${encodeURIComponent(manufacturer)}`,
      lastmod: now,
      changefreq: "weekly" as const,
      priority: "0.5",
    }));
  }

  // Generate popular equipment comparison pages for SEO
  generatePopularComparisonPages(equipment: Array<{ slug: string; name: string; category: string; manufacturer: string }>): SitemapUrl[] {
    const now = new Date().toISOString();
    const comparisonUrls: SitemapUrl[] = [];
    
    // Define high-value comparisons based on SEO research
    const popularComparisons = [
      // Popular rubber comparisons (based on search volume data)
      { slug1: "tenergy-05", slug2: "dignics-09c", priority: "0.8" },
      { slug1: "tenergy-05", slug2: "hurricane-3", priority: "0.8" },
      { slug1: "dignics-09c", slug2: "hurricane-3", priority: "0.7" },
      { slug1: "tenergy-64", slug2: "tenergy-05", priority: "0.7" },
      { slug1: "hurricane-3", slug2: "hurricane-3-neo", priority: "0.7" },
      { slug1: "tenergy-05", slug2: "evolution-mx-p", priority: "0.6" },
      { slug1: "dignics-05", slug2: "dignics-09c", priority: "0.6" },
      { slug1: "tenergy-80", slug2: "tenergy-05", priority: "0.6" },
      
      // Popular blade comparisons
      { slug1: "timo-boll-alc", slug2: "viscaria", priority: "0.7" },
      { slug1: "ma-long-carbon", slug2: "hurricane-long-5", priority: "0.7" },
      { slug1: "viscaria", slug2: "innerforce-layer-alc", priority: "0.6" },
      { slug1: "fan-zhendong-alc", slug2: "timo-boll-alc", priority: "0.6" },
    ];
    
    // Filter to only include comparisons where both equipment exist
    const equipmentSlugs = new Set(equipment.map(eq => eq.slug));
    const validComparisons = popularComparisons.filter(comp => 
      equipmentSlugs.has(comp.slug1) && equipmentSlugs.has(comp.slug2)
    );
    
    validComparisons.forEach(({ slug1, slug2, priority }) => {
      comparisonUrls.push({
        url: `${this.baseUrl}/equipment/compare/${slug1}-vs-${slug2}`,
        lastmod: now,
        changefreq: "weekly" as const,
        priority,
      });
    });
    
    // Generate category-based popular comparisons
    const rubbersByCategory = equipment.filter(eq => eq.category === 'rubber');
    const bladesByCategory = equipment.filter(eq => eq.category === 'blade');
    
    // Add top manufacturer vs manufacturer comparisons for rubbers
    const butterflyRubbers = rubbersByCategory.filter(r => r.manufacturer === 'Butterfly').slice(0, 3);
    const dhsRubbers = rubbersByCategory.filter(r => r.manufacturer === 'DHS').slice(0, 3);
    
    butterflyRubbers.forEach(butterfly => {
      dhsRubbers.forEach(dhs => {
        comparisonUrls.push({
          url: `${this.baseUrl}/equipment/compare/${butterfly.slug}-vs-${dhs.slug}`,
          lastmod: now,
          changefreq: "monthly" as const,
          priority: "0.5",
        });
      });
    });
    
    return comparisonUrls.slice(0, 50); // Limit to prevent sitemap bloat
  }

  // Generate equipment review pages (if they exist as separate routes)
  generateEquipmentReviewPages(equipment: Array<{ slug: string; updated_at: string }>): SitemapUrl[] {
    return equipment.map(item => ({
      url: `${this.baseUrl}/equipment/review/${item.slug}`,
      lastmod: new Date(item.updated_at).toISOString(),
      changefreq: "monthly" as const,
      priority: "0.6",
    }));
  }

  // Convert sitemap entries to XML format
  generateSitemapXml(urls: SitemapUrl[]): string {
    const xmlContent = urls
      .map(
        url => `  <url>
    <loc>${this.escapeXml(url.url)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlContent}
</urlset>`;
  }

  // Generate sitemap index XML
  generateSitemapIndexXml(sitemaps: SitemapEntry[]): string {
    const xmlContent = sitemaps
      .map(
        sitemap => `  <sitemap>
    <loc>${this.escapeXml(sitemap.url)}</loc>
    <lastmod>${sitemap.lastmod}</lastmod>
  </sitemap>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlContent}
</sitemapindex>`;
  }

  // Escape XML special characters
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Calculate sitemap statistics
  generateSitemapStats(urls: SitemapUrl[]): {
    totalUrls: number;
    lastModified: string;
    priorities: Record<string, number>;
    changeFrequencies: Record<string, number>;
  } {
    const priorities: Record<string, number> = {};
    const changeFrequencies: Record<string, number> = {};
    
    urls.forEach(url => {
      priorities[url.priority] = (priorities[url.priority] || 0) + 1;
      changeFrequencies[url.changefreq] = (changeFrequencies[url.changefreq] || 0) + 1;
    });

    return {
      totalUrls: urls.length,
      lastModified: new Date().toISOString(),
      priorities,
      changeFrequencies,
    };
  }
}

// Export singleton instance
export const sitemapService = new SitemapService();

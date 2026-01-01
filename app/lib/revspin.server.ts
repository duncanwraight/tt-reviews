/**
 * Revspin.net Parser Service
 *
 * Fetches and parses equipment data from revspin.net for admin import functionality.
 * Uses server-side fetch (Cloudflare Workers compatible).
 */

const REVSPIN_BASE_URL = "https://revspin.net";

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

export type RevspinCategory = "blade" | "rubber" | "pips_short" | "pips_long";

export interface RevspinListItem {
  name: string;
  slug: string;
  url: string;
  speed?: number;
  spin?: number;
  control?: number;
  stiffness?: number;
  tackiness?: number;
  deception?: number;
  overall?: number;
}

export interface RevspinProduct {
  name: string;
  manufacturer: string;
  category: "blade" | "rubber";
  subcategory?: "inverted" | "long_pips" | "short_pips" | "anti";
  slug: string;
  sourceUrl: string;
  specifications: Record<string, unknown>;
}

/**
 * Rate-limited fetch wrapper
 */
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TT-Reviews-Bot/1.0; +https://tabletennis.reviews)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response;
}

/**
 * Get the URL path for a category
 */
function getCategoryPath(category: RevspinCategory): string {
  switch (category) {
    case "blade":
      return "/blade/";
    case "rubber":
      return "/rubber/";
    case "pips_short":
      return "/pips/short/";
    case "pips_long":
      return "/pips/long/";
    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * Parse a numeric value from HTML text
 */
function parseNumber(text: string): number | undefined {
  const cleaned = text.trim().replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&sup2;/g, "²")
    .replace(/&sup3;/g, "³")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Extract product rows from HTML table
 * Uses a global search for all product links then extracts row context
 */
function parseProductTable(
  html: string,
  category: RevspinCategory
): RevspinListItem[] {
  const products: RevspinListItem[] = [];
  const seenSlugs = new Set<string>();

  // Get the category prefix for filtering links
  const categoryPrefix = category === "pips_short" || category === "pips_long"
    ? "pips/"
    : `${category}/`;

  // DEBUG: Log HTML length
  console.log(`[REVSPIN DEBUG] HTML length: ${html.length}`);
  console.log(`[REVSPIN DEBUG] Category prefix: ${categoryPrefix}`);

  // First, let's find ALL links ending in .html to understand the patterns
  // Use a flexible regex: any anchor tag with href to .html, capture content up to </a>
  const allLinkMatches = html.matchAll(
    /<a[^>]*href=["']([^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi
  );

  let totalLinks = 0;
  let categoryLinks = 0;

  for (const match of allLinkMatches) {
    totalLinks++;
    const [, href, rawName] = match;

    // Strip any HTML tags from the name and decode HTML entities
    const name = decodeHtmlEntities(rawName.replace(/<[^>]*>/g, "").trim());

    // DEBUG: Log first 10 links to see patterns
    if (totalLinks <= 10) {
      console.log(`[REVSPIN DEBUG] Link ${totalLinks}: href="${href.substring(0, 60)}", name="${name.substring(0, 30)}"`);
    }

    // Skip if not a product link for this category
    if (!href.includes(categoryPrefix)) continue;
    if (href.startsWith("http")) continue;
    if (href.includes("/user/")) continue;

    // Skip pagination/navigation links like "More"
    if (name.toLowerCase() === "more" || name.length < 2) continue;

    categoryLinks++;

    // Extract the slug from the URL
    const slug = href.replace(/\.html$/, "").split("/").pop() || "";

    // Skip duplicates
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    // Find the table row containing this link to get the stats
    // Look for the context around this link
    const linkIndex = html.indexOf(href);
    if (linkIndex === -1) continue;

    // Find the start and end of the row containing this link
    const rowStartSearch = html.lastIndexOf("<tr", linkIndex);
    const rowEndSearch = html.indexOf("</tr>", linkIndex);

    if (rowStartSearch === -1 || rowEndSearch === -1) continue;

    const rowHtml = html.substring(rowStartSearch, rowEndSearch + 5);

    // Extract all td contents from this row
    const cellMatches = rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    const cells: string[] = [];
    for (const cellMatch of cellMatches) {
      const cellContent = cellMatch[1].replace(/<[^>]*>/g, "").trim();
      cells.push(cellContent);
    }

    // DEBUG: Log first few products' cells
    if (categoryLinks <= 5) {
      console.log(`[REVSPIN DEBUG] Product "${name}" has ${cells.length} cells: ${JSON.stringify(cells.slice(0, 8))}`);
    }

    const item: RevspinListItem = {
      name: name || cells[0] || slug, // Fallback to cell content or slug
      slug,
      url: `${REVSPIN_BASE_URL}/${href.replace(/^\.\.\//, "")}`,
    };

    // Parse cells based on category (columns: Name, Speed, Control/Spin, Stiff/Tack, Overall, ...)
    if (cells.length >= 5) {
      if (category === "blade") {
        item.speed = parseNumber(cells[1]);
        item.control = parseNumber(cells[2]);
        item.stiffness = parseNumber(cells[3]);
        item.overall = parseNumber(cells[4]);
      } else if (category === "rubber") {
        item.speed = parseNumber(cells[1]);
        item.spin = parseNumber(cells[2]);
        item.tackiness = parseNumber(cells[3]);
        item.overall = parseNumber(cells[4]);
      } else if (category === "pips_short" || category === "pips_long") {
        item.speed = parseNumber(cells[1]);
        item.spin = parseNumber(cells[2]);
        item.deception = parseNumber(cells[3]);
        item.overall = parseNumber(cells[4]);
      }
    }

    products.push(item);
  }

  // DEBUG: Summary
  console.log(`[REVSPIN DEBUG] Summary: ${totalLinks} total links, ${categoryLinks} matching category, ${products.length} products parsed`);

  return products;
}

/**
 * Extract manufacturer from product detail page
 */
function parseManufacturer(html: string): string {
  // Look for brand links in the product page
  // Pattern: <a href="/blade/brand/">Brand Name</a> or similar
  const brandPattern =
    /<a\s+href="\/(?:blade|rubber|pips)\/([^/]+)\/"[^>]*>([^<]+)<\/a>/i;
  const match = html.match(brandPattern);

  if (match) {
    return match[2].trim();
  }

  // Alternative: look for "by Brand" text
  const byBrandPattern = /by\s+<a[^>]*>([^<]+)<\/a>/i;
  const byMatch = html.match(byBrandPattern);
  if (byMatch) {
    return byMatch[1].trim();
  }

  return "Unknown";
}

/**
 * Extract specifications from product detail page
 */
function parseSpecifications(
  html: string,
  category: RevspinCategory
): Record<string, unknown> {
  const specs: Record<string, unknown> = {};

  // Parse user ratings section
  // Look for patterns like "Speed: 9.3" or "Spin: 9.4"
  const ratingPatterns = [
    { key: "speed", pattern: /Speed[:\s]+(\d+\.?\d*)/i },
    { key: "spin", pattern: /Spin[:\s]+(\d+\.?\d*)/i },
    { key: "control", pattern: /Control[:\s]+(\d+\.?\d*)/i },
    { key: "tackiness", pattern: /Tackiness[:\s]+(\d+\.?\d*)/i },
    { key: "stiffness", pattern: /Stiffness[:\s]+(\d+\.?\d*)/i },
    { key: "hardness", pattern: /(?:Sponge\s+)?Hardness[:\s]+(\d+\.?\d*)/i },
    { key: "weight", pattern: /Weight[:\s]+(\d+\.?\d*)/i },
    { key: "throw_angle", pattern: /Throw\s*(?:Angle)?[:\s]+(\d+\.?\d*)/i },
    { key: "consistency", pattern: /Consistency[:\s]+(\d+\.?\d*)/i },
    { key: "durability", pattern: /Durability[:\s]+(\d+\.?\d*)/i },
    { key: "gears", pattern: /Gears[:\s]+(\d+\.?\d*)/i },
    { key: "deception", pattern: /Deception[:\s]+(\d+\.?\d*)/i },
    { key: "overall", pattern: /Overall[:\s]+(\d+\.?\d*)/i },
  ];

  for (const { key, pattern } of ratingPatterns) {
    const match = html.match(pattern);
    if (match) {
      specs[key] = parseFloat(match[1]);
    }
  }

  // For blades, look for plies and materials
  if (category === "blade") {
    const pliesMatch = html.match(/(\d+)\s*(?:ply|plies)/i);
    if (pliesMatch) {
      specs.plies = parseInt(pliesMatch[1], 10);
    }

    const weightMatch = html.match(/Weight[:\s]+(\d+)g/i);
    if (weightMatch) {
      specs.weight = `${weightMatch[1]}g`;
    }

    // Look for materials like "Arylate Carbon", "Wood", etc.
    const materialMatch = html.match(
      /Materials?[:\s]+([^<\n]+)/i
    );
    if (materialMatch) {
      specs.material = materialMatch[1].trim();
    }
  }

  // For rubbers, look for sponge info
  if (category === "rubber") {
    const densityMatch = html.match(/Density[:\s]+(\d+)/i);
    if (densityMatch) {
      specs.sponge_hardness = densityMatch[1];
    }
  }

  return specs;
}

/**
 * Fetch list of products for a category
 */
export async function fetchProductList(
  category: RevspinCategory
): Promise<RevspinListItem[]> {
  const path = getCategoryPath(category);
  const url = `${REVSPIN_BASE_URL}${path}`;

  console.log(`[REVSPIN DEBUG] Fetching URL: ${url}`);

  try {
    const response = await rateLimitedFetch(url);
    console.log(`[REVSPIN DEBUG] Response status: ${response.status}`);

    const html = await response.text();
    console.log(`[REVSPIN DEBUG] Response HTML length: ${html.length}`);

    const products = parseProductTable(html, category);
    console.log(`[REVSPIN DEBUG] Parsed ${products.length} products`);

    return products;
  } catch (error) {
    console.error(`[REVSPIN DEBUG] Error fetching product list for ${category}:`, error);
    return [];
  }
}

/**
 * Fetch full product details
 */
export async function fetchProductDetails(
  url: string,
  category: RevspinCategory
): Promise<RevspinProduct | null> {
  try {
    const response = await rateLimitedFetch(url);
    const html = await response.text();

    // Extract product name from page title or heading
    const titleMatch = html.match(/<title>([^<|]+)/i);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const name = (h1Match?.[1] || titleMatch?.[1] || "").trim();

    if (!name) {
      console.error("Could not extract product name from", url);
      return null;
    }

    const manufacturer = parseManufacturer(html);
    const specifications = parseSpecifications(html, category);

    // Extract slug from URL
    const slug = url.replace(/\.html$/, "").split("/").pop() || "";

    // Determine category and subcategory for our database
    let dbCategory: "blade" | "rubber" = "blade";
    let subcategory: "inverted" | "long_pips" | "short_pips" | "anti" | undefined;

    if (category === "blade") {
      dbCategory = "blade";
    } else if (category === "rubber") {
      dbCategory = "rubber";
      subcategory = "inverted";
    } else if (category === "pips_short") {
      dbCategory = "rubber";
      subcategory = "short_pips";
    } else if (category === "pips_long") {
      dbCategory = "rubber";
      subcategory = "long_pips";
    }

    return {
      name,
      manufacturer,
      category: dbCategory,
      subcategory,
      slug,
      sourceUrl: url,
      specifications,
    };
  } catch (error) {
    console.error(`Error fetching product details from ${url}:`, error);
    return null;
  }
}

/**
 * Convert a RevspinListItem to a RevspinProduct with basic info
 * (without fetching the detail page)
 * Returns null if manufacturer cannot be determined
 */
export function listItemToProduct(
  item: RevspinListItem,
  category: RevspinCategory
): RevspinProduct | null {
  let dbCategory: "blade" | "rubber" = "blade";
  let subcategory: "inverted" | "long_pips" | "short_pips" | "anti" | undefined;

  if (category === "blade") {
    dbCategory = "blade";
  } else if (category === "rubber") {
    dbCategory = "rubber";
    subcategory = "inverted";
  } else if (category === "pips_short") {
    dbCategory = "rubber";
    subcategory = "short_pips";
  } else if (category === "pips_long") {
    dbCategory = "rubber";
    subcategory = "long_pips";
  }

  // Extract manufacturer from the product name if possible
  // Many products on revspin are named like "Butterfly Tenergy 05"
  const knownBrands = [
    // Major brands
    "Butterfly",
    "DHS",
    "Yasaka",
    "Nittaku",
    "Tibhar",
    "Donic",
    "Xiom",
    "Stiga",
    "Joola",
    "Andro",
    "TSP",
    "Victas",
    "Yinhe",
    "Galaxy",
    "Milkyway",
    "Friendship",
    "729",
    "Palio",
    "Sanwei",
    "Gewo",
    "Killerspin",
    "Cornilleau",
    "Neottec",
    // Specialty/pips brands
    "SpinLord",
    "Dr. Neubauer",
    "Sauer & Troger",
    "Der Materialspezialist",
    "Dawei",
    "Double Fish",
    // Additional brands
    "Adidas",
    "Armstrong",
    "Avalox",
    "Banda",
    "Bank",
    "Blutenkirsche",
    "Bomb",
    "Champion",
    "Darker",
    "Dianchi",
    "Donier",
    "Double Happiness",
    "Gambler",
    "Globe",
    "Hallmark",
    "Hanno",
    "Imperial",
    "Kokutaku",
    "LKT",
    "Loki",
    "Mizuno",
    "Nitro",
    "Paddle Palace",
    "Pongori",
    "Reactor",
    "Ritc",
    "Sauer",
    "Sword",
    "Toni Hold",
    "Tuttle",
    "World of TT",
    "XuShaoFa",
    "Yashima",
    "Yulu",
  ];

  let manufacturer: string | null = null;
  for (const brand of knownBrands) {
    if (item.name.toLowerCase().startsWith(brand.toLowerCase())) {
      manufacturer = brand;
      break;
    }
  }

  // Skip products with unknown manufacturer
  if (!manufacturer) {
    return null;
  }

  // Build specifications from list data
  const specifications: Record<string, unknown> = {};
  if (item.speed !== undefined) specifications.speed = item.speed;
  if (item.spin !== undefined) specifications.spin = item.spin;
  if (item.control !== undefined) specifications.control = item.control;
  if (item.stiffness !== undefined) specifications.stiffness = item.stiffness;
  if (item.tackiness !== undefined) specifications.tackiness = item.tackiness;
  if (item.deception !== undefined) specifications.deception = item.deception;
  if (item.overall !== undefined) specifications.overall = item.overall;

  return {
    name: item.name,
    manufacturer,
    category: dbCategory,
    subcategory,
    slug: item.slug,
    sourceUrl: item.url,
    specifications,
  };
}

/**
 * Generate a database-compatible slug from a product name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

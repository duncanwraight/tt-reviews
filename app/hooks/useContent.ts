import { useLoaderData } from "react-router";

/**
 * Hook to access site content configured through the content management system
 * Returns a function to get content by key with fallback to the key itself
 */
export function useContent() {
  const data = useLoaderData() as any;
  const siteContent = data?.siteContent || {};

  /**
   * Get content by key, with fallback to the key itself if not found
   * @param key - The content key (e.g., 'homepage.hero.subtitle')
   * @param fallback - Optional fallback text if key is not found
   * @returns The content string or fallback
   */
  const getContent = (key: string, fallback?: string): string => {
    return siteContent[key] || fallback || key;
  };

  /**
   * Get content with a default value for development/testing
   * @param key - The content key
   * @param defaultValue - Default value to use
   * @returns The content string or default value
   */
  const getContentWithDefault = (key: string, defaultValue: string): string => {
    return siteContent[key] || defaultValue;
  };

  /**
   * Check if a content key exists
   * @param key - The content key to check
   * @returns true if the key exists
   */
  const hasContent = (key: string): boolean => {
    return key in siteContent;
  };

  /**
   * Get all content as key-value pairs
   * @returns Record of all content
   */
  const getAllContent = (): Record<string, string> => {
    return siteContent;
  };

  return {
    content: getContent,
    getContent,
    getContentWithDefault,
    hasContent,
    getAllContent,
    // Direct access for shorthand usage
    c: getContent,
  };
}

/**
 * Type helper for content keys to provide better TypeScript support
 * This can be extended with specific content keys for better IDE support
 */
export type ContentKey =
  | "homepage.hero.subtitle"
  | "homepage.featured_equipment.subtitle"
  | "homepage.popular_players.subtitle"
  | "homepage.categories.subtitle"
  | "equipment.page.description"
  | "equipment.expand_database.title"
  | "equipment.expand_database.description"
  | "players.page.description"
  | "players.expand_database.title"
  | "players.expand_database.description"
  | "search.landing.description"
  | "login.welcome_subtitle"
  | "footer.tagline"
  | string; // Allow any string for flexibility

/**
 * Typed version of useContent for better TypeScript experience
 */
export function useTypedContent() {
  const { getContent, getContentWithDefault, hasContent, getAllContent } =
    useContent();

  return {
    content: (key: ContentKey, fallback?: string) => getContent(key, fallback),
    getContent: (key: ContentKey, fallback?: string) =>
      getContent(key, fallback),
    getContentWithDefault: (key: ContentKey, defaultValue: string) =>
      getContentWithDefault(key, defaultValue),
    hasContent: (key: ContentKey) => hasContent(key),
    getAllContent,
  };
}

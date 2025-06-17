import type { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "./logger.server";

export interface SiteContent {
  id: string;
  key: string;
  content: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteContentData {
  key: string;
  content: string;
  description: string;
  category: string;
}

export interface UpdateSiteContentData {
  content?: string;
  description?: string;
  category?: string;
}

export class ContentService {
  private supabase: SupabaseClient;
  private logger = Logger;
  private contentCache: Map<string, string> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get content by key with caching
   */
  async getContent(key: string): Promise<string> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.isCacheValid() && this.contentCache.has(key)) {
        const content = this.contentCache.get(key)!;
        this.logger.debug("Content cache hit", {
          key,
          duration: Date.now() - startTime,
        });
        return content;
      }

      // Cache miss - load all content
      await this.loadAllContent();

      const content = this.contentCache.get(key);
      if (!content) {
        this.logger.warn("Content key not found", { key });
        return key; // Return key as fallback
      }

      this.logger.debug("Content retrieved", {
        key,
        duration: Date.now() - startTime,
      });
      return content;
    } catch (error) {
      this.logger.error("Failed to get content", { key, error });
      return key; // Return key as fallback
    }
  }

  /**
   * Get all content as key-value map
   */
  async getAllContent(): Promise<Record<string, string>> {
    const startTime = Date.now();

    try {
      if (!this.isCacheValid()) {
        await this.loadAllContent();
      }

      const result = Object.fromEntries(this.contentCache);
      this.logger.debug("All content retrieved", {
        count: Object.keys(result).length,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      this.logger.error("Failed to get all content", { error });
      return {};
    }
  }

  /**
   * Get content by category
   */
  async getContentByCategory(category: string): Promise<SiteContent[]> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from("site_content")
        .select("*")
        .eq("category", category)
        .order("key");

      if (error) throw error;

      this.logger.debug("Content by category retrieved", {
        category,
        count: data?.length || 0,
        duration: Date.now() - startTime,
      });

      return data || [];
    } catch (error) {
      this.logger.error("Failed to get content by category", {
        category,
        error,
      });
      return [];
    }
  }

  /**
   * Get all content records (for admin interface)
   */
  async getAllContentRecords(): Promise<SiteContent[]> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from("site_content")
        .select("*")
        .order("category", { ascending: true })
        .order("key", { ascending: true });

      if (error) throw error;

      this.logger.debug("All content records retrieved", {
        count: data?.length || 0,
        duration: Date.now() - startTime,
      });

      return data || [];
    } catch (error) {
      this.logger.error("Failed to get all content records", { error });
      return [];
    }
  }

  /**
   * Create new content
   */
  async createContent(
    contentData: CreateSiteContentData
  ): Promise<SiteContent> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from("site_content")
        .insert(contentData)
        .select()
        .single();

      if (error) throw error;

      // Invalidate cache
      this.invalidateCache();

      this.logger.info("Content created", {
        key: contentData.key,
        category: contentData.category,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to create content", { contentData, error });
      throw error;
    }
  }

  /**
   * Update content
   */
  async updateContent(
    key: string,
    updateData: UpdateSiteContentData
  ): Promise<SiteContent> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from("site_content")
        .update(updateData)
        .eq("key", key)
        .select()
        .single();

      if (error) throw error;

      // Invalidate cache
      this.invalidateCache();

      this.logger.info("Content updated", {
        key,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      this.logger.error("Failed to update content", { key, updateData, error });
      throw error;
    }
  }

  /**
   * Delete content
   */
  async deleteContent(key: string): Promise<void> {
    const startTime = Date.now();

    try {
      const { error } = await this.supabase
        .from("site_content")
        .delete()
        .eq("key", key);

      if (error) throw error;

      // Invalidate cache
      this.invalidateCache();

      this.logger.info("Content deleted", {
        key,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error("Failed to delete content", { key, error });
      throw error;
    }
  }

  /**
   * Search content
   */
  async searchContent(query: string): Promise<SiteContent[]> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from("site_content")
        .select("*")
        .or(
          `key.ilike.%${query}%,content.ilike.%${query}%,description.ilike.%${query}%`
        )
        .order("key");

      if (error) throw error;

      this.logger.debug("Content search completed", {
        query,
        count: data?.length || 0,
        duration: Date.now() - startTime,
      });

      return data || [];
    } catch (error) {
      this.logger.error("Failed to search content", { query, error });
      return [];
    }
  }

  /**
   * Load all content into cache
   */
  private async loadAllContent(): Promise<void> {
    const { data, error } = await this.supabase
      .from("site_content")
      .select("key, content");

    if (error) throw error;

    this.contentCache.clear();
    for (const item of data || []) {
      this.contentCache.set(item.key, item.content);
    }

    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry && this.contentCache.size > 0;
  }

  /**
   * Invalidate the content cache
   */
  private invalidateCache(): void {
    this.contentCache.clear();
    this.cacheExpiry = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; isValid: boolean; expiresIn: number } {
    return {
      size: this.contentCache.size,
      isValid: this.isCacheValid(),
      expiresIn: Math.max(0, this.cacheExpiry - Date.now()),
    };
  }
}

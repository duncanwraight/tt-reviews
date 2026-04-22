import { describe, it, expect, vi } from "vitest";
import * as search from "../search";
import type { DiscordContext } from "../types";

/**
 * Unit tests for search helpers — exercise DB-result formatting and the
 * slash-command Response wrapping with a mocked DatabaseService.
 */

function makeCtx(
  dbOverrides: Partial<{
    searchEquipment: (query: string) => Promise<any[]>;

    searchPlayers: (query: string) => Promise<any[]>;
  }> = {}
): DiscordContext {
  return {
    env: {
      SITE_URL: "https://tt-reviews.local",
    } as any,

    context: {} as any,
    dbService: {
      searchEquipment: vi.fn().mockResolvedValue([]),
      searchPlayers: vi.fn().mockResolvedValue([]),
      ...dbOverrides,
    } as any,

    moderationService: {} as any,

    unifiedNotifier: {} as any,
  };
}

describe("search.searchEquipment", () => {
  it("returns no-results message when DB returns empty", async () => {
    const ctx = makeCtx({ searchEquipment: vi.fn().mockResolvedValue([]) });
    const result = await search.searchEquipment(ctx, "butterfly");
    expect(result.content).toContain("No equipment found");
    expect(result.content).toContain("butterfly");
  });

  it("formats up to 5 results with name, manufacturer, category, url", async () => {
    const ctx = makeCtx({
      searchEquipment: vi.fn().mockResolvedValue([
        {
          name: "Viscaria",
          manufacturer: "Butterfly",
          category: "blade",
          slug: "butterfly-viscaria",
        },
      ]),
    });
    const result = await search.searchEquipment(ctx, "viscaria");
    expect(result.content).toContain("Viscaria");
    expect(result.content).toContain("Butterfly");
    expect(result.content).toContain("blade");
    expect(result.content).toContain(
      "https://tt-reviews.local/equipment/butterfly-viscaria"
    );
  });

  it("truncates to 5 results and appends a 'Showing top 5 of N' note", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `Item${i}`,
      manufacturer: "m",
      category: "blade",
      slug: `s${i}`,
    }));
    const ctx = makeCtx({
      searchEquipment: vi.fn().mockResolvedValue(six),
    });
    const result = await search.searchEquipment(ctx, "q");
    expect(result.content).toContain("Showing top 5 of 6");
  });

  it("returns a user-friendly error message on DB failure", async () => {
    const ctx = makeCtx({
      searchEquipment: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const result = await search.searchEquipment(ctx, "q");
    expect(result.content).toContain("Error searching equipment");
  });
});

describe("search.searchPlayer", () => {
  it("returns no-results message when DB returns empty", async () => {
    const ctx = makeCtx({ searchPlayers: vi.fn().mockResolvedValue([]) });
    const result = await search.searchPlayer(ctx, "ma long");
    expect(result.content).toContain("No players found");
  });

  it("formats player status and URL", async () => {
    const ctx = makeCtx({
      searchPlayers: vi
        .fn()
        .mockResolvedValue([
          { name: "Ma Long", active: true, slug: "ma-long" },
        ]),
    });
    const result = await search.searchPlayer(ctx, "ma long");
    expect(result.content).toContain("Ma Long");
    expect(result.content).toContain("Active");
    expect(result.content).toContain(
      "https://tt-reviews.local/players/ma-long"
    );
  });

  it("renders 'Inactive' for inactive players", async () => {
    const ctx = makeCtx({
      searchPlayers: vi
        .fn()
        .mockResolvedValue([{ name: "Retired", active: false, slug: "r" }]),
    });
    const result = await search.searchPlayer(ctx, "r");
    expect(result.content).toContain("Inactive");
  });

  it("returns a user-friendly error on DB failure", async () => {
    const ctx = makeCtx({
      searchPlayers: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const result = await search.searchPlayer(ctx, "q");
    expect(result.content).toContain("Error searching players");
  });
});

describe("search.handleEquipmentSearch (Response wrapper)", () => {
  it("returns an ephemeral error when query is empty", async () => {
    const ctx = makeCtx();
    const response = await search.handleEquipmentSearch(ctx, "   ");
    expect(response).toBeInstanceOf(Response);
    const body = (await response.json()) as {
      type: number;
      data: { content: string; flags?: number };
    };
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("search query");
  });

  it("wraps searchEquipment results in a type-4 response", async () => {
    const ctx = makeCtx({
      searchEquipment: vi
        .fn()
        .mockResolvedValue([
          { name: "x", manufacturer: "m", category: "blade", slug: "x" },
        ]),
    });
    const response = await search.handleEquipmentSearch(ctx, "x");
    const body = (await response.json()) as {
      type: number;
      data: { content: string; flags?: number };
    };
    expect(body.type).toBe(4);
    expect(body.data.content).toContain("x");
  });
});

describe("search.handlePlayerSearch (Response wrapper)", () => {
  it("returns an ephemeral error when query is empty", async () => {
    const ctx = makeCtx();
    const response = await search.handlePlayerSearch(ctx, "");
    const body = (await response.json()) as {
      type: number;
      data: { content: string; flags?: number };
    };
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
  });

  it("wraps searchPlayer results in a type-4 response", async () => {
    const ctx = makeCtx({
      searchPlayers: vi
        .fn()
        .mockResolvedValue([{ name: "x", active: true, slug: "x" }]),
    });
    const response = await search.handlePlayerSearch(ctx, "x");
    const body = (await response.json()) as {
      type: number;
      data: { content: string; flags?: number };
    };
    expect(body.type).toBe(4);
    expect(body.data.content).toContain("x");
  });
});

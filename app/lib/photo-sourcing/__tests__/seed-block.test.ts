import { describe, it, expect } from "vitest";
import {
  buildSeedBlock,
  buildUpdateStatement,
  spliceBlock,
  SEED_BEGIN_MARKER,
  SEED_END_MARKER,
  type SeedRow,
} from "../seed-block";

const PLAYER_ROW: SeedRow = {
  slug: "ma-long",
  image_key: "player/ma-long/seed.webp",
  image_etag: "abc123",
  image_credit_text: "World Table Tennis",
  image_credit_link: null,
  image_license_short: null,
  image_license_url: null,
  image_source_url: "https://www.worldtabletennis.com/p/1",
};

const EQUIPMENT_ROW: SeedRow = {
  slug: "stiga-airoc-m",
  image_key: "cf/abc-uuid",
  image_etag: "abc-uuid",
  image_credit_text: "www.revspin.net",
  image_credit_link: "https://www.revspin.net/x",
  image_license_short: null,
  image_license_url: null,
  image_source_url: "https://www.revspin.net/x",
};

describe("buildUpdateStatement", () => {
  it("emits a multi-line UPDATE with all image_* columns and SQL-quoting", () => {
    const sql = buildUpdateStatement("players", PLAYER_ROW);
    expect(sql).toContain("UPDATE players SET");
    expect(sql).toContain("image_key = 'player/ma-long/seed.webp'");
    expect(sql).toContain("image_credit_link = NULL");
    expect(sql).toContain("WHERE slug = 'ma-long';");
  });

  it("escapes single quotes in values", () => {
    const sql = buildUpdateStatement("players", {
      ...PLAYER_ROW,
      image_credit_text: "O'Sullivan",
    });
    expect(sql).toContain("image_credit_text = 'O''Sullivan'");
  });
});

describe("buildSeedBlock", () => {
  it("includes both -- players and -- equipment subsections", () => {
    const block = buildSeedBlock({
      players: [PLAYER_ROW],
      equipment: [EQUIPMENT_ROW],
    });
    expect(block.startsWith(SEED_BEGIN_MARKER)).toBe(true);
    expect(block.endsWith(SEED_END_MARKER)).toBe(true);
    expect(block).toContain("-- players");
    expect(block).toContain("-- equipment");
    expect(block).toContain("UPDATE players SET");
    expect(block).toContain("UPDATE equipment SET");
  });

  it("omits sections that are empty (no header line emitted)", () => {
    const block = buildSeedBlock({ players: [], equipment: [EQUIPMENT_ROW] });
    expect(block).not.toContain("-- players");
    expect(block).toContain("-- equipment");
  });

  it("is byte-deterministic for a given input ordering", () => {
    const a = buildSeedBlock({
      players: [PLAYER_ROW],
      equipment: [EQUIPMENT_ROW],
    });
    const b = buildSeedBlock({
      players: [PLAYER_ROW],
      equipment: [EQUIPMENT_ROW],
    });
    expect(a).toBe(b);
  });
});

describe("spliceBlock", () => {
  const SEED = [
    "-- some preamble",
    "INSERT INTO players (...) VALUES (...);",
    "",
    SEED_BEGIN_MARKER,
    "-- old block contents",
    "UPDATE players SET image_key = 'old' WHERE slug = 'x';",
    SEED_END_MARKER,
    "",
    "-- trailing content",
  ].join("\n");

  it("replaces the marker block with the supplied block, preserving surroundings", () => {
    const block = buildSeedBlock({
      players: [PLAYER_ROW],
      equipment: [],
    });
    const next = spliceBlock(SEED, block);
    expect(next.startsWith("-- some preamble")).toBe(true);
    expect(next.endsWith("-- trailing content")).toBe(true);
    expect(next).toContain("ma-long");
    expect(next).not.toContain("UPDATE players SET image_key = 'old'");
  });

  it("is idempotent: splicing the same block twice yields the same string", () => {
    const block = buildSeedBlock({
      players: [PLAYER_ROW],
      equipment: [EQUIPMENT_ROW],
    });
    const once = spliceBlock(SEED, block);
    const twice = spliceBlock(once, block);
    expect(once).toBe(twice);
  });

  it("throws when markers are missing", () => {
    expect(() => spliceBlock("no markers here", "block")).toThrow(/Markers/);
  });
});

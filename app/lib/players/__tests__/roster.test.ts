import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetRosterCacheForTests,
  deriveSlug,
  findByName,
  loadRosterCandidates,
  normaliseDisplayName,
  wttProfileUrl,
} from "../roster.server";

afterEach(() => {
  __resetRosterCacheForTests();
});

const FIXTURE_ROSTER = [
  {
    ittfid: 132473,
    fullName: "LIN Shidong",
    nationality: "CHN",
    countryName: "China",
    gender: "M",
    age: 21,
    ranking: "1",
    headShot: "https://wtt.example/headshot/lin-shidong.jpg",
  },
  {
    ittfid: 100123,
    fullName: "Truls MOREGARDH",
    nationality: "SWE",
    countryName: "Sweden",
    gender: "M",
    age: 22,
    ranking: "5",
    headShot: "",
  },
];

function mockFetchOk(payload: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

describe("normaliseDisplayName", () => {
  it("title-cases ALL-CAPS surname tokens", () => {
    expect(normaliseDisplayName("LIN Shidong")).toBe("Lin Shidong");
    expect(normaliseDisplayName("Truls MOREGARDH")).toBe("Truls Moregardh");
  });

  it("leaves already-mixed-case names untouched", () => {
    expect(normaliseDisplayName("Adriana Diaz")).toBe("Adriana Diaz");
  });

  it("preserves single-letter tokens as-is", () => {
    expect(normaliseDisplayName("J Smith")).toBe("J Smith");
  });
});

describe("deriveSlug", () => {
  it("lowercases and hyphenates Latin names", () => {
    expect(deriveSlug("Lin Shidong")).toBe("lin-shidong");
    expect(deriveSlug("Adriana Diaz")).toBe("adriana-diaz");
  });

  it("strips diacritics", () => {
    expect(deriveSlug("Tomáš Polanský")).toBe("tomas-polansky");
  });

  it("returns empty string for non-Latin names (orchestrator falls back to player-<ittfid>)", () => {
    expect(deriveSlug("林詩棟")).toBe("");
  });
});

describe("wttProfileUrl", () => {
  it("returns the public WTT profile URL keyed on ittfid", () => {
    expect(wttProfileUrl(132473)).toBe(
      "https://www.worldtabletennis.com/playerDescription?playerId=132473"
    );
  });
});

describe("loadRosterCandidates", () => {
  it("maps WTT roster entries to importer candidates with display names + headshot URLs", async () => {
    const fetchImpl = mockFetchOk(FIXTURE_ROSTER);
    const candidates = await loadRosterCandidates(fetchImpl);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      source: "wtt",
      ittfid: 132473,
      name: "Lin Shidong",
      raw_name: "LIN Shidong",
      represents: "CHN",
      gender: "M",
      headshot_url: "https://wtt.example/headshot/lin-shidong.jpg",
      wtt_profile_url:
        "https://www.worldtabletennis.com/playerDescription?playerId=132473",
    });
    expect(candidates[1].headshot_url).toBeUndefined();
  });

  it("caches the roster for the lifetime of the isolate", async () => {
    const fetchImpl = mockFetchOk(FIXTURE_ROSTER);
    await loadRosterCandidates(fetchImpl);
    await loadRosterCandidates(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on non-array responses", async () => {
    const fetchImpl = mockFetchOk({ error: "bad" });
    await expect(loadRosterCandidates(fetchImpl)).rejects.toThrow(
      /unexpected response shape/
    );
  });
});

describe("findByName", () => {
  it("matches by exact normalised name", async () => {
    const fetchImpl = mockFetchOk(FIXTURE_ROSTER);
    const found = await findByName("Lin Shidong", fetchImpl);
    expect(found?.ittfid).toBe(132473);
  });

  it("matches across surname/given-name flip via sorted-tokens fallback", async () => {
    const fetchImpl = mockFetchOk(FIXTURE_ROSTER);
    const found = await findByName("Shidong Lin", fetchImpl);
    expect(found?.ittfid).toBe(132473);
  });

  it("returns null when no match", async () => {
    const fetchImpl = mockFetchOk(FIXTURE_ROSTER);
    expect(await findByName("Nobody Here", fetchImpl)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/wtt-roster-snippet.json";
import {
  mapRosterEntry,
  normaliseName,
  wttProfileUrl,
  wttProvider,
} from "../wtt";

interface RawRosterEntry {
  ittfid: number;
  fullName: string;
  nationality: string;
  countryName: string;
  gender: string;
  age: number;
  ranking: string;
  headShot: string;
}

const ROSTER = fixture as RawRosterEntry[];

describe("normaliseName", () => {
  it("title-cases all-caps surname tokens", () => {
    expect(normaliseName("WANG Chuqin")).toBe("Wang Chuqin");
    expect(normaliseName("Felix LEBRUN")).toBe("Felix Lebrun");
  });

  it("preserves already-mixed-case tokens", () => {
    expect(normaliseName("Hugo Calderano")).toBe("Hugo Calderano");
  });

  it("preserves diacritics on the display name", () => {
    expect(normaliseName("Tröger")).toBe("Tröger");
    expect(normaliseName("DÜRR")).toBe("Dürr");
  });

  it("collapses repeated whitespace", () => {
    expect(normaliseName("  WANG   Chuqin ")).toBe("Wang Chuqin");
  });
});

describe("wttProfileUrl", () => {
  it("returns the canonical player description URL", () => {
    expect(wttProfileUrl(121558)).toBe(
      "https://www.worldtabletennis.com/playerDescription?playerId=121558"
    );
  });
});

describe("mapRosterEntry", () => {
  it("maps a real WTT roster entry to a PlayerCandidate", () => {
    const entry = ROSTER[0];
    expect(entry).toBeDefined();
    const candidate = mapRosterEntry(entry!);

    expect(candidate.source).toBe("wtt");
    expect(candidate.ittfid).toBe(121558);
    expect(candidate.name).toBe("Wang Chuqin");
    expect(candidate.represents).toBe("CHN");
    expect(candidate.gender).toBe("M");
    expect(candidate.wtt_profile_url).toBe(
      "https://www.worldtabletennis.com/playerDescription?playerId=121558"
    );
    expect(candidate.image_source_url).toMatch(/^https:\/\//);
    expect(candidate.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("leaves handedness, grip, birth_country, highest_rating, active_years unset on the WTT path", () => {
    const candidate = mapRosterEntry(ROSTER[0]!);
    expect(candidate.handedness).toBeUndefined();
    expect(candidate.grip).toBeUndefined();
    expect(candidate.birth_country).toBeUndefined();
    expect(candidate.highest_rating).toBeUndefined();
    expect(candidate.active_years).toBeUndefined();
  });

  it("normalises gender — unrecognised values become undefined", () => {
    const candidate = mapRosterEntry({
      ...ROSTER[0]!,
      gender: "X",
    });
    expect(candidate.gender).toBeUndefined();
  });

  it("drops non-three-letter `nationality` values", () => {
    const candidate = mapRosterEntry({
      ...ROSTER[0]!,
      nationality: "",
    });
    expect(candidate.represents).toBeUndefined();
  });

  it("drops empty headshot URLs rather than passing through empty string", () => {
    const candidate = mapRosterEntry({
      ...ROSTER[0]!,
      headShot: "",
    });
    expect(candidate.image_source_url).toBeUndefined();
  });
});

function makeFetch(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("wttProvider.fetchCandidates", () => {
  it("returns one candidate per valid roster entry", async () => {
    const result = await wttProvider.fetchCandidates({
      fetchImpl: makeFetch(ROSTER),
    });
    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(ROSTER.length);
    expect(result.candidates[0]!.name).toBe("Wang Chuqin");
  });

  it("respects the limit option", async () => {
    const result = await wttProvider.fetchCandidates({
      fetchImpl: makeFetch(ROSTER),
      limit: 2,
    });
    expect(result.candidates).toHaveLength(2);
  });

  it("filters out malformed entries from the response", async () => {
    const payload = [
      ROSTER[0],
      {
        ittfid: "not-a-number",
        fullName: "x",
        nationality: "FRA",
        gender: "M",
      },
      ROSTER[1],
    ];
    const result = await wttProvider.fetchCandidates({
      fetchImpl: makeFetch(payload),
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(c => c.ittfid)).toEqual([121558, 131163]);
  });

  it("throws on a non-200 response", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(wttProvider.fetchCandidates({ fetchImpl })).rejects.toThrow(
      /WTT roster fetch → 500/
    );
  });

  it("throws when the response body is not an array", async () => {
    const fetchImpl = makeFetch({ error: "shape" });
    await expect(wttProvider.fetchCandidates({ fetchImpl })).rejects.toThrow(
      /unexpected response shape/
    );
  });
});

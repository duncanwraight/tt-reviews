import { describe, expect, it } from "vitest";

import { RunLog, candidateForLog, truncateExcerpt } from "../run-log";

describe("RunLog", () => {
  it("records entries in order and stamps each with a fixed clock", () => {
    let tick = 0;
    const log = new RunLog({
      now: () => new Date(Date.UTC(2026, 4, 4, 12, 0, tick++)),
    });
    log.record({
      step: "source_started",
      source_id: "butterfly",
      source_tier: 1,
      source_kind: "manufacturer",
    });
    log.record({
      step: "search",
      source_id: "butterfly",
      query_url: "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria",
      status: "ok",
      count: 0,
      candidates: [],
    });
    const out = log.toJSON();
    expect(out).toHaveLength(2);
    expect(out[0].at).toBe("2026-05-04T12:00:00.000Z");
    expect(out[1].at).toBe("2026-05-04T12:00:01.000Z");
    expect(out[0]).toMatchObject({
      step: "source_started",
      source_id: "butterfly",
    });
    expect(out[1]).toMatchObject({ step: "search", count: 0 });
  });

  it("returns a defensive copy from toJSON", () => {
    const log = new RunLog();
    log.record({ step: "outcome", status: "no-results" });
    const a = log.toJSON();
    a.length = 0;
    expect(log.toJSON()).toHaveLength(1);
  });

  it("accepts every step variant in the discriminated union", () => {
    const log = new RunLog({ now: () => new Date(Date.UTC(2026, 4, 4)) });
    log.record({
      step: "source_skipped_brand",
      source_id: "butterfly",
      source_brand: "Butterfly",
      equipment_brand: "Stiga",
    });
    log.record({
      step: "prefilter",
      source_id: "butterfly",
      seed_tokens: ["viscaria"],
      brand_tokens: ["butterfly"],
      kept: [],
      dropped: [
        {
          url: "https://example/x",
          title: "X",
          missing_tokens: ["viscaria"],
          extra_tokens: [],
        },
      ],
    });
    log.record({
      step: "match",
      source_id: "butterfly",
      candidate_url: "https://example/x",
      status: "ok",
      matches: false,
      confidence: 0.1,
      probe_excerpt: "<html>",
    });
    log.record({
      step: "match_summary",
      source_id: "butterfly",
      survivors_attempted: 3,
      winner_url: null,
    });
    log.record({
      step: "fetch",
      source_id: "butterfly",
      candidate_url: "https://example/x",
      status: "failed",
      error: "ECONNRESET",
    });
    log.record({
      step: "extract",
      source_id: "butterfly",
      candidate_url: "https://example/x",
      status: "null_result",
      excerpt: "<html>",
    });
    log.record({
      step: "contribution",
      source_id: "tt11",
      candidate_url: "https://tt11/x",
      fields: ["weight"],
      description: false,
    });
    log.record({
      step: "source_done",
      source_id: "tt11",
      reason: "contributed",
    });
    log.record({
      step: "merge",
      merged_field_count: 1,
      per_field_winners: { weight: "tt11" },
      description_source_id: null,
    });
    log.record({
      step: "outcome",
      status: "proposed",
      merged_field_count: 1,
    });
    expect(log.toJSON().map(e => e.step)).toEqual([
      "source_skipped_brand",
      "prefilter",
      "match",
      "match_summary",
      "fetch",
      "extract",
      "contribution",
      "source_done",
      "merge",
      "outcome",
    ]);
  });
});

describe("candidateForLog", () => {
  it("strips snippet and keeps url + title", () => {
    expect(
      candidateForLog({
        url: "https://example/x",
        title: "X",
        snippet: "long snippet text that we don't want in the log",
      })
    ).toEqual({ url: "https://example/x", title: "X" });
  });
});

describe("truncateExcerpt", () => {
  it("returns input unchanged when shorter than max", () => {
    expect(truncateExcerpt("hello", 10)).toBe("hello");
  });

  it("truncates and appends an ellipsis when longer than max", () => {
    const out = truncateExcerpt("a".repeat(20), 10);
    expect(out).toBe("aaaaaaaaaa…");
  });

  it("trims trailing whitespace before appending the ellipsis", () => {
    const out = truncateExcerpt("hello     world", 7);
    expect(out).toBe("hello…");
  });
});

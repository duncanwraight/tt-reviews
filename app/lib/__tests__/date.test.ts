import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../date";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-04-28T12:00:00.000Z");

  it("returns 'just now' for sub-minute deltas", () => {
    expect(formatRelativeTime("2026-04-28T11:59:30.000Z", NOW)).toBe(
      "just now"
    );
    expect(formatRelativeTime("2026-04-28T11:59:01.000Z", NOW)).toBe(
      "just now"
    );
  });

  it("returns 'just now' for future timestamps (clock skew)", () => {
    expect(formatRelativeTime("2026-04-28T12:00:30.000Z", NOW)).toBe(
      "just now"
    );
  });

  it("buckets minutes between 60s and 60m", () => {
    expect(formatRelativeTime("2026-04-28T11:59:00.000Z", NOW)).toBe("1m ago");
    expect(formatRelativeTime("2026-04-28T11:30:00.000Z", NOW)).toBe("30m ago");
    expect(formatRelativeTime("2026-04-28T11:01:00.000Z", NOW)).toBe("59m ago");
  });

  it("buckets hours between 60m and 24h", () => {
    expect(formatRelativeTime("2026-04-28T11:00:00.000Z", NOW)).toBe("1h ago");
    expect(formatRelativeTime("2026-04-28T08:00:00.000Z", NOW)).toBe("4h ago");
    expect(formatRelativeTime("2026-04-27T13:00:00.000Z", NOW)).toBe("23h ago");
  });

  it("buckets days at 24h+", () => {
    expect(formatRelativeTime("2026-04-27T12:00:00.000Z", NOW)).toBe("1d ago");
    expect(formatRelativeTime("2026-04-21T12:00:00.000Z", NOW)).toBe("7d ago");
  });

  it("accepts Date objects", () => {
    expect(formatRelativeTime(new Date("2026-04-27T12:00:00.000Z"), NOW)).toBe(
      "1d ago"
    );
  });
});

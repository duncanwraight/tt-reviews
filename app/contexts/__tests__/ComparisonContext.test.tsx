// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ComparisonProvider,
  useComparison,
} from "~/contexts/ComparisonContext";

const STORAGE_KEY = "tt-compare-selection";

function wrapper({ children }: { children: ReactNode }) {
  return <ComparisonProvider>{children}</ComparisonProvider>;
}

function makeEquipment(overrides: Partial<{ id: string; slug: string }> = {}) {
  return {
    id: overrides.id ?? "eq-1",
    name: `Equipment ${overrides.id ?? "1"}`,
    slug: overrides.slug ?? "equipment-1",
    category: "rubber",
    subcategory: "inverted",
    manufacturer: "ACME",
  };
}

describe("ComparisonContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty when localStorage has no selection", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    expect(result.current.selectedEquipment).toEqual([]);
    expect(result.current.canCompare).toBe(false);
    expect(result.current.getCompareUrl()).toBeNull();
  });

  it("hydrates selection from localStorage on mount", () => {
    const seeded = [
      makeEquipment({ id: "a", slug: "alpha" }),
      makeEquipment({ id: "b", slug: "beta" }),
    ];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { result } = renderHook(() => useComparison(), { wrapper });

    expect(result.current.selectedEquipment.map(e => e.id)).toEqual(["a", "b"]);
    expect(result.current.canCompare).toBe(true);
  });

  it("ignores malformed localStorage content without crashing", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useComparison(), { wrapper });
    expect(result.current.selectedEquipment).toEqual([]);
  });

  it("ignores non-array localStorage content", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useComparison(), { wrapper });
    expect(result.current.selectedEquipment).toEqual([]);
  });

  it("toggleEquipment adds and then removes the same item", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    const item = makeEquipment({ id: "a", slug: "alpha" });

    act(() => result.current.toggleEquipment(item));
    expect(result.current.selectedEquipment.map(e => e.id)).toEqual(["a"]);

    act(() => result.current.toggleEquipment(item));
    expect(result.current.selectedEquipment).toEqual([]);
  });

  it("caps at 2 and drops the oldest when a third item is added", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    const a = makeEquipment({ id: "a", slug: "alpha" });
    const b = makeEquipment({ id: "b", slug: "beta" });
    const c = makeEquipment({ id: "c", slug: "charlie" });

    act(() => result.current.toggleEquipment(a));
    act(() => result.current.toggleEquipment(b));
    act(() => result.current.toggleEquipment(c));

    // Oldest ('a') dropped, newest two remain.
    expect(result.current.selectedEquipment.map(e => e.id)).toEqual(["b", "c"]);
  });

  it("removeEquipment removes by id", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    const a = makeEquipment({ id: "a", slug: "alpha" });
    const b = makeEquipment({ id: "b", slug: "beta" });

    act(() => result.current.toggleEquipment(a));
    act(() => result.current.toggleEquipment(b));
    act(() => result.current.removeEquipment("a"));

    expect(result.current.selectedEquipment.map(e => e.id)).toEqual(["b"]);
  });

  it("clearSelection empties the list", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() =>
      result.current.toggleEquipment(makeEquipment({ id: "a", slug: "alpha" }))
    );
    act(() => result.current.clearSelection());
    expect(result.current.selectedEquipment).toEqual([]);
  });

  it("getCompareUrl returns null with fewer than 2 items", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    expect(result.current.getCompareUrl()).toBeNull();
    act(() =>
      result.current.toggleEquipment(makeEquipment({ id: "a", slug: "alpha" }))
    );
    expect(result.current.getCompareUrl()).toBeNull();
  });

  it("getCompareUrl returns the alphabetical slug pair regardless of selection order", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    const beta = makeEquipment({ id: "b", slug: "beta" });
    const alpha = makeEquipment({ id: "a", slug: "alpha" });

    // Select beta first, then alpha. URL should still be alpha-vs-beta.
    act(() => result.current.toggleEquipment(beta));
    act(() => result.current.toggleEquipment(alpha));

    expect(result.current.getCompareUrl()).toBe(
      "/equipment/compare/alpha-vs-beta"
    );
  });

  it("persists the selection to localStorage on change", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() =>
      result.current.toggleEquipment(makeEquipment({ id: "a", slug: "alpha" }))
    );
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("a");
  });
});

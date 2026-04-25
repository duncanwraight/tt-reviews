import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  image_key?: string;
}

interface ComparisonContextType {
  selectedEquipment: Equipment[];
  toggleEquipment: (equipment: Equipment) => void;
  removeEquipment: (id: string) => void;
  clearSelection: () => void;
  canCompare: boolean;
  getCompareUrl: () => string | null;
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(
  undefined
);

const STORAGE_KEY = "tt-compare-selection";
export const MIN_SELECTION = 2;
export const MAX_SELECTION = 3;

function readStoredSelection(): Equipment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_SELECTION)
      .filter(
        (item): item is Equipment =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Equipment).id === "string" &&
          typeof (item as Equipment).slug === "string"
      );
  } catch {
    return [];
  }
}

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR/client mismatch.
  // Only adopt the stored selection if the user hasn't already interacted —
  // a click between first paint and this effect would otherwise be clobbered.
  useEffect(() => {
    setSelectedEquipment(prev =>
      prev.length > 0 ? prev : readStoredSelection()
    );
    setHydrated(true);
  }, []);

  // Persist selection on change. Skip until hydration completes so we don't
  // wipe persisted state with the empty initial render.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(selectedEquipment)
      );
    } catch {
      // Quota / private-mode failures are non-fatal.
    }
  }, [hydrated, selectedEquipment]);

  const toggleEquipment = useCallback((equipment: Equipment) => {
    setSelectedEquipment(prev => {
      const isSelected = prev.find(item => item.id === equipment.id);
      if (isSelected) {
        return prev.filter(item => item.id !== equipment.id);
      }
      if (prev.length < MAX_SELECTION) {
        return [...prev, equipment];
      }
      // At cap: drop the oldest, keep the rest + new one.
      return [...prev.slice(1), equipment];
    });
  }, []);

  const removeEquipment = useCallback((id: string) => {
    setSelectedEquipment(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEquipment([]);
  }, []);

  const canCompare = selectedEquipment.length >= MIN_SELECTION;

  const getCompareUrl = useCallback(() => {
    const count = selectedEquipment.length;
    if (count < MIN_SELECTION) return null;
    const sorted = [...selectedEquipment].sort((x, y) =>
      x.slug.localeCompare(y.slug)
    );
    if (count === 2) {
      return `/equipment/compare/${sorted[0].slug}-vs-${sorted[1].slug}`;
    }
    const ids = sorted.map(item => item.slug).join(",");
    return `/equipment/compare?ids=${ids}`;
  }, [selectedEquipment]);

  return (
    <ComparisonContext.Provider
      value={{
        selectedEquipment,
        toggleEquipment,
        removeEquipment,
        clearSelection,
        canCompare,
        getCompareUrl,
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const context = useContext(ComparisonContext);
  if (context === undefined) {
    throw new Error("useComparison must be used within a ComparisonProvider");
  }
  return context;
}

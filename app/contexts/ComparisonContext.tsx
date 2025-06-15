import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
}

interface ComparisonContextType {
  isCompareMode: boolean;
  selectedEquipment: Equipment[];
  toggleCompareMode: () => void;
  toggleEquipment: (equipment: Equipment) => void;
  clearSelection: () => void;
  canCompare: boolean;
  getCompareUrl: () => string | null;
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(undefined);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([]);

  const toggleCompareMode = useCallback(() => {
    setIsCompareMode(prev => {
      if (prev) {
        // If turning off compare mode, clear selection
        setSelectedEquipment([]);
      }
      return !prev;
    });
  }, []);

  const toggleEquipment = useCallback((equipment: Equipment) => {
    setSelectedEquipment(prev => {
      const isSelected = prev.find(item => item.id === equipment.id);
      
      if (isSelected) {
        // Remove if already selected
        return prev.filter(item => item.id !== equipment.id);
      } else {
        // Add if not selected and we have room
        if (prev.length < 2) {
          return [...prev, equipment];
        } else {
          // Replace the first item if we already have 2
          return [prev[1], equipment];
        }
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEquipment([]);
  }, []);

  const canCompare = selectedEquipment.length === 2;

  const getCompareUrl = useCallback(() => {
    if (selectedEquipment.length === 2) {
      return `/equipment/compare/${selectedEquipment[0].slug}-vs-${selectedEquipment[1].slug}`;
    }
    return null;
  }, [selectedEquipment]);

  return (
    <ComparisonContext.Provider
      value={{
        isCompareMode,
        selectedEquipment,
        toggleCompareMode,
        toggleEquipment,
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
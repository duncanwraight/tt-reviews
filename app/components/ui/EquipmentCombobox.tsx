import { useState, useRef, useEffect } from "react";

export interface EquipmentOption {
  id: string;
  name: string;
  manufacturer: string;
}

interface EquipmentComboboxProps {
  name: string;
  options: EquipmentOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  value?: string; // Selected equipment ID
  onChange?: (id: string, name: string) => void;
}

export function EquipmentCombobox({
  name,
  options,
  placeholder = "Search equipment...",
  disabled = false,
  required = false,
  value,
  onChange,
}: EquipmentComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Find selected option to display its name
  const selectedOption = options.find(opt => opt.id === value);

  // Filter options based on search term
  const filteredOptions = options.filter(opt => {
    const search = searchTerm.toLowerCase();
    return (
      opt.name.toLowerCase().includes(search) ||
      opt.manufacturer.toLowerCase().includes(search)
    );
  });

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (option: EquipmentOption) => {
    setSearchTerm("");
    setIsOpen(false);
    onChange?.(option.id, option.name);
  };

  const handleClear = () => {
    setSearchTerm("");
    onChange?.("", "");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchTerm("");
        break;
    }
  };

  return (
    <div className="relative">
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={value || ""} />

      {/* Display selected value or search input */}
      {selectedOption && !isOpen ? (
        <div className="flex items-center w-full px-3 py-2 border border-gray-300 rounded-md bg-white">
          <span className="flex-1 text-gray-900">
            {selectedOption.name}{" "}
            <span className="text-gray-500">({selectedOption.manufacturer})</span>
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-2 text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay to allow click on option
            setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
        />
      )}

      {/* Dropdown */}
      {isOpen && !disabled && (
        <ul
          ref={listRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-gray-500 text-sm">
              No equipment found
            </li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.id}
                onClick={() => handleSelect(option)}
                className={`px-3 py-2 cursor-pointer ${
                  index === highlightedIndex
                    ? "bg-purple-100 text-purple-900"
                    : "hover:bg-gray-100"
                }`}
              >
                <span className="font-medium">{option.name}</span>
                <span className="text-gray-500 ml-1">({option.manufacturer})</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

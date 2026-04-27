import { Link, useLocation } from "react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import {
  ADMIN_DASHBOARD_PATH,
  ADMIN_NAV_GROUPS,
  getActiveGroupIndex,
  isDashboardActive,
  isNavItemActive,
  type AdminNavGroup,
} from "./nav-config";

const triggerBase =
  "border-b-2 whitespace-nowrap py-4 px-1 font-medium text-sm transition-colors";
const triggerInactive =
  "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300";
const triggerActive = "border-purple-600 text-purple-700";

export function AdminNav() {
  const location = useLocation();
  const dashboardActive = isDashboardActive(location.pathname);
  const activeGroupIndex = getActiveGroupIndex(location.pathname);

  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpenGroupIndex(null);
  }, [location.pathname]);

  useEffect(() => {
    if (openGroupIndex === null) return;
    function handlePointer(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroupIndex(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGroupIndex(null);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openGroupIndex]);

  return (
    <nav
      ref={navRef}
      aria-label="Admin"
      className="bg-white border-b border-gray-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8">
          <Link
            to={ADMIN_DASHBOARD_PATH}
            aria-current={dashboardActive ? "page" : undefined}
            className={`${triggerBase} ${
              dashboardActive ? triggerActive : triggerInactive
            }`}
          >
            Dashboard
          </Link>
          {ADMIN_NAV_GROUPS.map((group, index) => (
            <AdminNavDropdown
              key={group.label}
              group={group}
              isActive={activeGroupIndex === index}
              isOpen={openGroupIndex === index}
              onToggle={() =>
                setOpenGroupIndex(openGroupIndex === index ? null : index)
              }
              onClose={() => setOpenGroupIndex(null)}
              currentPath={location.pathname}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

interface AdminNavDropdownProps {
  group: AdminNavGroup;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  currentPath: string;
}

function AdminNavDropdown({
  group,
  isActive,
  isOpen,
  onToggle,
  onClose,
  currentPath,
}: AdminNavDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const menuId = useId();

  function focusItem(index: number) {
    const target = itemRefs.current[index];
    if (target) target.focus();
  }

  function handleTriggerKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (!isOpen) onToggle();
      requestAnimationFrame(() => focusItem(0));
    }
  }

  function handleItemKey(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number
  ) {
    const count = group.items.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem((index + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem((index - 1 + count) % count);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(count - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-current={isActive ? "page" : undefined}
        onClick={onToggle}
        onKeyDown={handleTriggerKey}
        className={`${triggerBase} inline-flex items-center gap-1 ${
          isActive ? triggerActive : triggerInactive
        }`}
      >
        {group.label}
        <ChevronDown
          className={`size-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={group.label}
          className="absolute left-0 top-full z-20 min-w-[14rem] rounded-md border border-gray-200 bg-white shadow-lg py-1"
        >
          {group.items.map((item, index) => {
            const active = isNavItemActive(currentPath, item);
            return (
              <Link
                key={item.to}
                to={item.to}
                ref={el => {
                  itemRefs.current[index] = el;
                }}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onKeyDown={event => handleItemKey(event, index)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  active
                    ? "bg-purple-50 text-purple-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

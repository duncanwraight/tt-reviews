import { Link, useLocation } from "react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, Menu, X } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelId = useId();

  useEffect(() => {
    setOpenGroupIndex(null);
    setMobileOpen(false);
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

  useEffect(() => {
    if (!mobileOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);

  return (
    <nav
      ref={navRef}
      aria-label="Admin"
      className="bg-white border-b border-gray-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop: grouped dropdown nav (md+) */}
        <div className="hidden md:flex space-x-8">
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

        {/* Mobile: hamburger + collapsible panel (< md) */}
        <div className="md:hidden flex items-center justify-between py-2">
          <span className="text-sm font-medium text-gray-700">Admin Menu</span>
          <button
            ref={hamburgerRef}
            type="button"
            aria-label="Toggle admin navigation"
            aria-expanded={mobileOpen}
            aria-controls={mobilePanelId}
            onClick={() => setMobileOpen(open => !open)}
            className="p-2 rounded-md text-gray-700 hover:text-purple-600 hover:bg-gray-100"
          >
            {mobileOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <AdminNavMobilePanel
          id={mobilePanelId}
          currentPath={location.pathname}
          activeGroupIndex={activeGroupIndex}
          dashboardActive={dashboardActive}
          onNavigate={() => setMobileOpen(false)}
        />
      )}
    </nav>
  );
}

interface AdminNavMobilePanelProps {
  id: string;
  currentPath: string;
  activeGroupIndex: number;
  dashboardActive: boolean;
  onNavigate: () => void;
}

function AdminNavMobilePanel({
  id,
  currentPath,
  activeGroupIndex,
  dashboardActive,
  onNavigate,
}: AdminNavMobilePanelProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(
    () => new Set(activeGroupIndex >= 0 ? [activeGroupIndex] : [])
  );

  function toggleSection(index: number) {
    setOpenIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div
      id={id}
      className="md:hidden border-t border-gray-200 bg-white px-4 sm:px-6 py-2"
    >
      <Link
        to={ADMIN_DASHBOARD_PATH}
        onClick={onNavigate}
        aria-current={dashboardActive ? "page" : undefined}
        className={`block px-3 py-2 rounded-md text-base font-medium ${
          dashboardActive
            ? "bg-purple-50 text-purple-700"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        Dashboard
      </Link>
      {ADMIN_NAV_GROUPS.map((group, index) => {
        const isOpen = openIndexes.has(index);
        const isActive = activeGroupIndex === index;
        const sectionId = `${id}-section-${index}`;
        return (
          <div key={group.label} className="border-t border-gray-100 mt-2 pt-2">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={sectionId}
              onClick={() => toggleSection(index)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-base font-medium ${
                isActive ? "text-purple-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={`size-4 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {isOpen && (
              <ul id={sectionId} className="pl-3">
                {group.items.map(item => {
                  const active = isNavItemActive(currentPath, item);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`block px-3 py-2 rounded-md text-sm ${
                          active
                            ? "bg-purple-50 text-purple-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
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

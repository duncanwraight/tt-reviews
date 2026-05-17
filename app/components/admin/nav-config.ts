export interface AdminNavItem {
  label: string;
  to: string;
  // "exact" disables the default prefix match. Use when a sibling item
  // owns a path that nests under this one (e.g. "New Equipment" =
  // /admin/import vs "Equipment Imports" = /admin/import/jobs) and we
  // don't want both to highlight when the user is on the nested path.
  match?: "exact";
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_DASHBOARD_PATH = "/admin";

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Moderation",
    items: [
      { label: "Equipment Submissions", to: "/admin/equipment-submissions" },
      { label: "Equipment Edits", to: "/admin/equipment-edits" },
      { label: "Equipment Reviews", to: "/admin/equipment-reviews" },
      { label: "Equipment Setups", to: "/admin/player-equipment-setups" },
      { label: "Player Submissions", to: "/admin/player-submissions" },
      { label: "Player Edits", to: "/admin/player-edits" },
      { label: "Video Submissions", to: "/admin/video-submissions" },
    ],
  },
  {
    label: "Import",
    items: [
      { label: "Equipment Photos", to: "/admin/equipment-photos" },
      { label: "Manufacturer Specs", to: "/admin/manufacturer-specs" },
      { label: "New Equipment", to: "/admin/import", match: "exact" },
      { label: "Equipment Imports", to: "/admin/import/jobs" },
      { label: "Import Players", to: "/admin/import-players" },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Categories", to: "/admin/categories" },
      { label: "Content", to: "/admin/content" },
    ],
  },
];

export function isDashboardActive(pathname: string): boolean {
  return (
    pathname === ADMIN_DASHBOARD_PATH || pathname === `${ADMIN_DASHBOARD_PATH}/`
  );
}

export function isNavItemActive(pathname: string, item: AdminNavItem): boolean {
  if (item.match === "exact") return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function getActiveGroupIndex(pathname: string): number {
  if (isDashboardActive(pathname)) return -1;
  return ADMIN_NAV_GROUPS.findIndex(group =>
    group.items.some(item => isNavItemActive(pathname, item))
  );
}

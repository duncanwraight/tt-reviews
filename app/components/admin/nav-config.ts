export interface AdminNavItem {
  label: string;
  to: string;
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
      { label: "Spec Proposals", to: "/admin/spec-proposals" },
      { label: "New Equipment", to: "/admin/import" },
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
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function getActiveGroupIndex(pathname: string): number {
  if (isDashboardActive(pathname)) return -1;
  return ADMIN_NAV_GROUPS.findIndex(group =>
    group.items.some(item => isNavItemActive(pathname, item))
  );
}

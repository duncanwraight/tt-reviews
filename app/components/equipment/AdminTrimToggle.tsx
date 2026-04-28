import { Form, useNavigation } from "react-router";
import { Crop, Loader2 } from "lucide-react";

interface AdminTrimToggleProps {
  slug: string;
  trimKind: string | null;
  csrfToken: string;
}

// Admin-only toggle for the TT-88 force-trim button. Shown on the
// public equipment detail page beneath the header when the loader
// reports user.role === "admin". Posts to
// /admin/equipment/:slug/toggle-trim — the action ensures admin gating
// + CSRF check server-side, so even if this component leaked into a
// non-admin render the action would 302 to /.
//
// State labels:
//   trimKind === 'auto'   → system detected transparent edges; admin
//                           can override to disable trim entirely.
//   trimKind === 'border' → admin manually enabled trim.
//   trimKind === null     → no trim active; admin can enable.
export function AdminTrimToggle({
  slug,
  trimKind,
  csrfToken,
}: AdminTrimToggleProps) {
  const navigation = useNavigation();
  const action = `/admin/equipment/${slug}/toggle-trim`;
  const isSubmitting =
    navigation.state === "submitting" && navigation.formAction === action;
  const trimActive = trimKind != null;

  const statusLabel =
    trimKind === "auto"
      ? "Auto-trim active (transparent edges detected)"
      : trimKind === "border"
        ? "Manual trim active"
        : "No trim";

  const buttonLabel = trimActive ? "Disable trim" : "Trim white edges";

  return (
    <div
      className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3"
      data-testid="admin-trim-toggle"
    >
      <div className="flex items-center gap-2 text-sm text-purple-900">
        <Crop className="size-4" aria-hidden="true" />
        <span className="font-medium">Admin · image trim</span>
        <span
          className="text-purple-700"
          data-testid="admin-trim-status"
          data-trim-kind={trimKind ?? "null"}
        >
          {statusLabel}
        </span>
      </div>
      <Form method="post" action={action}>
        <input type="hidden" name="_csrf" value={csrfToken} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded border border-purple-300 bg-white px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="admin-trim-button"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Updating…
            </>
          ) : (
            buttonLabel
          )}
        </button>
      </Form>
    </div>
  );
}

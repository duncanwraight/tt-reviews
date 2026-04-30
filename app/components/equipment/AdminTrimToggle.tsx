import { Form, useNavigation } from "react-router";
import { Crop, Loader2 } from "lucide-react";

interface AdminTrimToggleProps {
  slug: string;
  trimKind: string | null;
  csrfToken: string;
}

// Admin-only toggle for the TT-88 force-trim button. Rendered inside
// the equipment detail header's actions slot. Posts to
// /admin/equipment/:slug/toggle-trim — the action enforces admin gating
// + CSRF check server-side, so even if this component leaked into a
// non-admin render the action would 302 to /.
//
// Trim states (encoded on the button via data-trim-kind):
//   'auto'   → system detected transparent edges; admin can disable.
//   'border' → admin manually enabled trim.
//   null     → no trim active; admin can enable.
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
  const buttonLabel = trimActive ? "Disable trim" : "Trim white edges";

  return (
    <Form method="post" action={action} data-testid="admin-trim-toggle">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="admin-trim-button"
        data-trim-kind={trimKind ?? "null"}
        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Updating…
          </>
        ) : (
          <>
            <Crop className="size-4" aria-hidden="true" />
            {buttonLabel}
          </>
        )}
      </button>
    </Form>
  );
}

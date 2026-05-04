import { Form, useNavigation } from "react-router";
import { ImageDown, Loader2, RefreshCw } from "lucide-react";

interface AdminRequeueButtonsProps {
  slug: string;
  csrfToken: string;
  // Specs button enables once the row has been touched by sourcing —
  // never-sourced rows get picked up automatically by the cron, so the
  // re-queue is a no-op. Same idea for photos: anything signalling a
  // prior attempt (cooldown stamp, manual skip, or a picked image)
  // means the button has work to do.
  specsTouched: boolean;
  photosTouched: boolean;
}

export function AdminRequeueButtons({
  slug,
  csrfToken,
  specsTouched,
  photosTouched,
}: AdminRequeueButtonsProps) {
  const navigation = useNavigation();
  const specsAction = `/admin/equipment/${slug}/requeue-specs`;
  const photosAction = `/admin/equipment/${slug}/requeue-photos`;
  const specsSubmitting =
    navigation.state === "submitting" && navigation.formAction === specsAction;
  const photosSubmitting =
    navigation.state === "submitting" && navigation.formAction === photosAction;

  return (
    <>
      <Form
        method="post"
        action={specsAction}
        data-testid="admin-requeue-specs-form"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <button
          type="submit"
          disabled={!specsTouched || specsSubmitting}
          data-testid="admin-requeue-specs-button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {specsSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Re-queuing…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden="true" />
              Re-queue specs
            </>
          )}
        </button>
      </Form>
      <Form
        method="post"
        action={photosAction}
        data-testid="admin-requeue-photos-form"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <button
          type="submit"
          disabled={!photosTouched || photosSubmitting}
          data-testid="admin-requeue-photos-button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {photosSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Re-queuing…
            </>
          ) : (
            <>
              <ImageDown className="size-4" aria-hidden="true" />
              Re-queue photo
            </>
          )}
        </button>
      </Form>
    </>
  );
}

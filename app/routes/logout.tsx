import type { Route } from "./+types/logout"

export async function action({ request, context }: Route.ActionArgs) {
  const { logout } = await import("~/lib/auth-utils.server")
  return await logout(request, context)
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { logout } = await import("~/lib/auth-utils.server")
  return await logout(request, context)
}
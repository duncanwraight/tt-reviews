import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";
import { isDevelopment } from "./env.server";

// SECURITY.md Phase 9 (TT-18). `@supabase/ssr` sets `httpOnly`,
// `sameSite: "lax"`, and `secure` by default on its auth cookies, but
// we still harden the serialization path: if any option goes missing
// (library regression, future wrapper) we coerce it to the safe value
// before appending to Set-Cookie. `secure` is forced off when the
// Worker is running in development mode so local HTTP cookies still
// set — the browser won't accept `Secure` on a non-HTTPS origin.
export function hardenCookieOptions(
  options: Parameters<typeof serializeCookieHeader>[2] | undefined,
  isDev: boolean
): Parameters<typeof serializeCookieHeader>[2] {
  return {
    ...(options ?? {}),
    httpOnly: options?.httpOnly ?? true,
    sameSite: options?.sameSite ?? "lax",
    secure: isDev ? false : (options?.secure ?? true),
    path: options?.path ?? "/",
  };
}

export const getServerClient = (request: Request, context: AppLoadContext) => {
  const env = context.cloudflare.env as Cloudflare.Env;
  const headers = new Headers();
  const isDev = isDevelopment(context);
  const supabase = createServerClient(
    env.SUPABASE_URL!,
    env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies =
            parseCookieHeader(request.headers.get("Cookie") ?? "") ?? [];
          return cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value || "",
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(
                name,
                value,
                hardenCookieOptions(options, isDev)
              )
            )
          );
        },
      },
    }
  );

  return { client: supabase, headers: headers };
};

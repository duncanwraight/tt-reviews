import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";

export const getServerClient = (request: Request, context: AppLoadContext) => {
	const env = context.cloudflare.env as Cloudflare.Env;
	const headers = new Headers();
	const supabase = createServerClient(
		env.SUPABASE_URL!,
		env.SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					const cookies = parseCookieHeader(request.headers.get("Cookie") ?? "") ?? [];
					return cookies.map(cookie => ({
						name: cookie.name,
						value: cookie.value || ""
					}));
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value, options }) =>
						headers.append(
							"Set-Cookie",
							serializeCookieHeader(name, value, options),
						),
					);
				},
			},
		},
	);

	return { client: supabase, headers: headers };
};
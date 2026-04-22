# Authentication & RBAC

Patterns for Supabase auth in this project. Referenced from `CLAUDE.md`.

## Core principle

Always use **client-side only authentication** for auth operations (login, signup, logout). Do NOT mix server-side and client-side auth in the same component.

## Supabase clients

### Server-side (loaders only)

```typescript
// app/lib/supabase.server.ts
import { createServerClient } from "@supabase/ssr";
import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

export const getServerClient = (request: Request, context: AppLoadContext) => {
  const env = context.cloudflare.env as Record<string, string>;
  const headers = new Headers();
  const supabase = createServerClient(
    env.SUPABASE_URL!,
    env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "") ?? {};
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            )
          );
        },
      },
    }
  );
  return { client: supabase, headers: headers };
};
```

### Client-side (components)

```typescript
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
```

## Patterns

### Login / signup form

- Use **regular HTML `<form>`**, NOT React Router's `<Form>`.
- Handle submission with a client-side `onSubmit` handler.
- Use `createBrowserClient`.
- Share one form between login and signup using button `value`.

```typescript
const doLogin = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
    "value"
  );

  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const result =
    intent === "signup"
      ? await supabase.auth.signUp({
          email: formData.get("email") as string,
          password: formData.get("password") as string,
        })
      : await supabase.auth.signInWithPassword({
          email: formData.get("email") as string,
          password: formData.get("password") as string,
        });
  // Handle result...
};
```

### Protected route

- Use the server client **in the loader only** to check auth status.
- Redirect unauthenticated users to `/login`.
- Pass env vars to the client for browser operations.

```typescript
export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (!userResponse?.data?.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  return data(
    {
      user: userResponse.data.user,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Record<string, string>)
          .SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}
```

### Logout

Always client-side.

```typescript
const handleLogout = async () => {
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  await supabase.auth.signOut();
  navigate("/login");
};
```

## What NOT to do

- ❌ React Router's `<Form>` with a server-side `action` for auth.
- ❌ Mixing server-side auth actions with client-side auth in the same component.
- ❌ Server-side client for login/logout operations.

## Env var access

- **Local dev**: use `tt-reviews.local:54321`, not `localhost:54321` (localhost has hit silent ipv6 failures).
- **Cloudflare Workers**: `context.cloudflare.env as Record<string, string>`.
- **Node scripts**: `process.env`.

## RBAC — user roles via JWT claims

Role values: `'admin'`, `'moderator'`, `'user'` (default).

### Reading a user's role

**Server (loader)**:

```typescript
import { getUserWithRole } from "~/lib/auth.server";
const user = await getUserWithRole(sbServerClient);
```

**Client**:

```typescript
{
  user?.role === "admin" ? <AdminComponent /> : <RegularComponent />;
}
```

### Assigning roles

- Manual: `INSERT INTO user_roles (user_id, role) VALUES (uuid, 'admin')`.
- Auto-promotion: set `AUTO_ADMIN_EMAILS` env var to a comma-separated list. Users matching those emails are promoted on signup / signin. Existing roles are preserved (no demotion).

### Auth hook

Supabase auth hook adds the `user_role` claim to JWT tokens. Must be enabled in Supabase Dashboard → Authentication → Hooks for production.

**Important**: the `user_role` claim is only refreshed at login. After changing a user's role, they must log out and back in for policies that read `auth.jwt() ->> 'user_role'` to see the new value.

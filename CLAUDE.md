# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`
- **Coding standards and best practices** can be found in `./docs/CODING-STANDARDS.md` - follow these for all code
- UI/UX design guidelines and style principles can be found in `./docs/STYLE-GUIDE.md`
- Layout guide can be found in `./docs/LAYOUT.md`
- Make sure that SEO strategy and optimization guidelines (found in `./docs/SEO.md`) are constantly referenced when designing every relevant part of the application

## Interactions with my device

- All references to localhost should be replaced with "tt-reviews.local" which is set up to point at 127.0.0.1 in my `/etc/hosts` file
  - This is especially applicable when working locally with Supabase as in the past `localhost` has ended with silent ipv6 failures

## Asking about tasks

### Non-destructive tasks (no permission needed):

- File operations: ls, read, grep, find, cat, rg
- Git operations: add, push, status, diff, log
- Package managers: npm install, npm run (build/test/lint/test:discord)
- Database reads: SELECT queries
- When running docker exec commands for data retrieval - e.g. database SELECTs or the aforementioned commands executed within a container
- I will run supabase commands for you - apart from supabase migrations up, you can run that one without permission

### Tasks that don't require permission:

- Updating markdown files (\*.md) in the docs/ directory or project root
- Running `git add` or `git push` commands

### Destructive tasks (ask first):

- File modifications to code files: edit, write, delete
- Git commits
- Database writes: INSERT, UPDATE, DELETE
- System configuration changes

## TODOs

- Every new change we work on should be stored in `./docs/TODO.md`
- You should read this file every time we start a new conversation

## Frontend requirements

- Break down large JSX blocks into small, focused React components
- Create reusable UI components in `/app/components/ui/` 
- Create page-specific components in `/app/components/[feature]/`
- Use composition over large monolithic components
- Implement proper TypeScript interfaces for all component props
- Follow single responsibility principle - each component should have one clear purpose
- Create layout components (`PageLayout`, `PageSection`) for consistent structure
- Avoid inline JSX blocks - extract into named components with clear interfaces
- Use proper React patterns: controlled components, proper event handling, etc.

## Authentication Architecture

### Core Auth Principles

**CRITICAL**: Always use **client-side only authentication** for all auth operations. Do NOT mix server-side and client-side auth in the same component.

### Supabase Client Setup

#### Server-Side Client (for server loaders only)
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
            headers.append("Set-Cookie", serializeCookieHeader(name, value, options))
          );
        },
      },
    }
  );
  return { client: supabase, headers: headers };
};
```

#### Client-Side Browser Client
```typescript
// In React components
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
);
```

### Auth Patterns

#### 1. Login/Signup Forms
- Use **regular HTML forms** (`<form>`) NOT React Router's `<Form>`
- Handle form submission with **client-side only** `onSubmit` handlers
- Use `createBrowserClient` for all auth operations
- Handle both login and signup in the same form using button `value` attribute

```typescript
const doLogin = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
  
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  
  let result;
  if (intent === 'signup') {
    result = await supabase.auth.signUp({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    });
  } else {
    result = await supabase.auth.signInWithPassword({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    });
  }
  
  // Handle result...
};
```

#### 2. Protected Routes
- Use server-side client in **loaders only** to check auth status
- Redirect unauthenticated users to login
- Pass environment variables to client for browser operations

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
        SUPABASE_URL: (context.cloudflare.env as Record<string, string>).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Record<string, string>).SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}
```

#### 3. Logout
- Always use client-side logout
- Redirect after successful logout

```typescript
const handleLogout = async () => {
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  await supabase.auth.signOut();
  navigate("/login");
};
```

### What NOT to Do

❌ **DO NOT** use React Router's `<Form>` with server-side `action` functions for auth
❌ **DO NOT** mix server-side auth actions with client-side auth in the same component  
❌ **DO NOT** use server-side client for login/logout operations
❌ **DO NOT** return different cookie parsing formats between working and non-working apps

### Environment Variables

- **Local Development**: Use `tt-reviews.local:54321` instead of `localhost:54321` 
- **Cloudflare**: Access via `context.cloudflare.env as Record<string, string>`
- **Regular Node.js**: Access via `process.env` (reference apps only)

## Important Notes

- Don't try to run Bash(npm run dev) commands, I will do those - just ask me to do it and await my feedback
- Always remember RLS policies for our Supabase databases (local and prod)
- Don't run `supabase db reset` without EXPRESSLY ASKING TO DO SO in CAPITAL LETTERS
- To run database queries, use `docker exec` on the relevant Supabase database container

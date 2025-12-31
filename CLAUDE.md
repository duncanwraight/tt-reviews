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
- I will run supabase commands for you locally
- Production database migrations are automatically applied via GitHub Actions workflow on push to main

### Tasks that don't require permission:

- Updating markdown files (\*.md) in the docs/ directory or project root
- Running `git add` or `git push` commands

### Destructive tasks (ask first):

- File modifications to code files: edit, write, delete
- Git commits
- Database writes: INSERT, UPDATE, DELETE
- System configuration changes

## TODOs

- Bugs and features are tracked in `./todo/BUGS.md` and `./todo/FEATURES.md`
- Archived planning docs are in `./docs/archive/`
- You should read the todo files every time we start a new conversation

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

#### Client-Side Browser Client

```typescript
// In React components
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
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
  const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
    "value"
  );

  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  let result;
  if (intent === "signup") {
    result = await supabase.auth.signUp({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  } else {
    result = await supabase.auth.signInWithPassword({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
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

## Role-Based Access Control (RBAC)

This project uses **Supabase RBAC** with JWT claims following official best practices.

### Using User Roles in Components

**In Route Loaders** (server-side):

```typescript
// Use the utility function for consistent user role handling
import { getUserWithRole } from "~/lib/auth.server";
const user = await getUserWithRole(sbServerClient);
```

**In Components** (client-side):

```typescript
// Access user role from loader data: user.role will be 'admin', 'moderator', or 'user'
{user?.role === "admin" ? <AdminComponent /> : <RegularComponent />}
```

**Role Values**: `'admin'`, `'moderator'`, `'user'` (default)

### Managing User Roles

- **Add role manually**: `INSERT INTO user_roles (user_id, role) VALUES (uuid, 'admin')`
- **Auto-promotion**: Set `AUTO_ADMIN_EMAILS` environment variable with comma-separated email addresses that should be automatically promoted to admin when they sign up or sign in
- **Auth hook**: Automatically adds `user_role` claim to JWT tokens
- **Production**: Enable auth hook in Supabase Dashboard > Authentication > Hooks

#### Auto Admin Promotion

```bash
# Environment variable for automatic admin promotion
AUTO_ADMIN_EMAILS=admin@yourcompany.com,moderator@yourcompany.com
```

This feature automatically promotes specified email addresses to admin role when they access the application. This is secure because:

- Only emails explicitly listed in the environment variable are promoted
- Email validation is performed
- Promotion only happens for authenticated users
- Existing roles are preserved (won't demote existing admins)

## Row Level Security (RLS) Policies

### Critical: Use JWT Claims for Role Checks

**NEVER** query the `user_roles` table directly in RLS policies. The `user_roles` table has restricted access (only `supabase_auth_admin` can read it).

```sql
-- WRONG: Will fail with "permission denied for table user_roles"
CREATE POLICY "admin_only" ON my_table
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- CORRECT: Use JWT claims
CREATE POLICY "admin_only" ON my_table
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');
```

### RLS Policy Patterns

| Access Level | Policy Pattern |
|--------------|----------------|
| Public read | `FOR SELECT USING (true)` |
| Authenticated read | `FOR SELECT TO authenticated USING (true)` |
| Own records only | `USING (auth.uid() = user_id)` |
| Admin only | `USING ((auth.jwt() ->> 'user_role') = 'admin')` |
| Admin or moderator | `USING ((auth.jwt() ->> 'user_role') IN ('admin', 'moderator'))` |

### Before Creating RLS Migrations

1. **Check existing patterns** in `supabase/migrations/` - especially `20250612221534_implement_proper_rbac_with_auth_hooks.sql`
2. **Never query `user_roles` directly** - always use `auth.jwt() ->> 'user_role'`
3. **Test policies locally** before pushing to production
4. **Remember SELECT policies** - if admins need to see all records (including inactive), add a separate admin SELECT policy

### Common RLS Issues

| Symptom | Likely Cause |
|---------|--------------|
| "permission denied for table user_roles" | RLS policy queries user_roles instead of using JWT claims |
| Empty results for admin | Missing admin SELECT policy (only public SELECT exists) |
| Update/delete fails silently | USING clause doesn't match, or missing policy for operation |

## React Router v7 File-Based Routing

This project uses **file-based routing** with React Router v7. Key configuration details:

### Routes Configuration

- **File**: `/app/routes.ts` uses `flatRoutes()` from `@react-router/fs-routes`
- **Pattern**: Routes are automatically discovered based on file naming conventions
- **No manual registration** needed - just create files with correct names

### File Naming Conventions

#### Basic Routes

```
/app/routes/
├── _index.tsx          → / (root/home page)
├── login.tsx           → /login
├── profile.tsx         → /profile
```

#### Nested Routes with Layout

```
/app/routes/
├── equipment.tsx           → Layout component with <Outlet />
├── equipment._index.tsx    → /equipment (content)
├── equipment.submit.tsx    → /equipment/submit (content)
├── equipment.$slug.tsx     → /equipment/:slug (content)
```

#### Dynamic Parameters

- Use `$` prefix for dynamic segments: `equipment.$slug.tsx` → `/equipment/:slug`
- Use `_index.tsx` for index routes within nested layouts

### Layout Structure

When you have nested routes (e.g., `equipment.*`):

1. **Layout file** (`equipment.tsx`):

   - Contains shared layout (Navigation, Footer, etc.)
   - Must include `<Outlet />` where child routes render
   - Handles auth and common data loading

2. **Child routes** (`equipment._index.tsx`, `equipment.submit.tsx`):
   - Contain only the specific content for that route
   - NO layout components (Navigation, Footer, PageLayout)
   - Render inside the parent's `<Outlet />`

### Route Resolution Order

- More specific routes are matched first automatically
- `/equipment/submit` takes precedence over `/equipment/:slug`
- No manual ordering needed with proper file naming

### Best Practices

- ✅ Use layout files for shared components across route families
- ✅ Keep child routes focused on content only
- ✅ Follow dot notation for nested routes (`parent.child.tsx`)
- ❌ Don't duplicate layout components in child routes
- ❌ Don't manually configure routes in `routes.ts` unless necessary

## Code Quality Standards

### TypeScript Requirements

**CRITICAL**: All code must pass TypeScript type checking. Run `npm run typecheck` before committing.

#### Type Safety Rules

1. **Always define explicit types** for function parameters, return types, and component props
2. **Never use `any`** unless absolutely necessary - use `unknown` and narrow the type
3. **Use proper type guards** for runtime type checking:
   ```typescript
   // Good: Type guard
   if ("success" in actionData && actionData.success) { ... }

   // Bad: Unsafe access
   if (actionData?.success) { ... }  // May fail type checking
   ```

4. **Add new properties to type definitions** when extending interfaces:
   ```typescript
   // When adding a field to Equipment, update app/lib/types.ts
   export interface Equipment {
     // ... existing fields
     new_field?: string;  // Add here
   }
   ```

5. **Use proper Env type casting**:
   ```typescript
   // Correct pattern for Cloudflare env
   const env = context.cloudflare.env as unknown as Record<string, string>;
   ```

#### Common Type Pitfalls to Avoid

| Pitfall | Solution |
|---------|----------|
| Adding new field types | Add to `FieldType` union in `app/lib/submissions/registry.ts` |
| New submission types | Add to all relevant union types in `types.ts`, `moderation.server.ts`, `database.server.ts` |
| Renamed/deleted routes | Delete stale types in `.react-router/types/app/routes/+types/` |
| Promise.all() results | Use explicit type annotations or separate fetches for different return types |
| Supabase query results | Cast results appropriately: `data as Equipment[]` |
| Optional vs null | Use `?? undefined` not `|| null` when interface expects `undefined` |

#### LogContext Usage

When using the Logger service, pass objects that extend LogContext:
```typescript
import { createLogContext, type LogContext } from "~/lib/logger.server";

// Create a context for request tracking
const logContext = createLogContext("operation_name");

// LogContext allows additional properties via index signature
Logger.info("Message", { requestId: "...", customField: "value" });
```

### Pre-Push Checks (MANDATORY)

**CRITICAL**: Before pushing ANY changes, you MUST run the following checks locally and ensure they pass:

```bash
# 1. Install dependencies (if needed)
npm install

# 2. Run TypeScript type checking
npm run typecheck

# 3. If typecheck fails, identify which errors are from YOUR changes vs pre-existing
# Only push if you haven't introduced NEW errors
```

### Workflow Check Rules

1. **Always run `npm run typecheck`** before committing/pushing code changes
2. **New TypeScript errors are blockers** - do not push if you introduced new errors
3. **Pre-existing errors** are documented in `./todo/BUGS.md` under "TypeScript Errors"
4. **If you add a new field type, enum value, or interface** - ensure it's added to all relevant type definitions
5. **If you rename/delete a route file** - delete stale generated types in `.react-router/types/`

### Common Issues to Check

- New field types must be added to `FieldType` union in `registry.ts`
- Renamed routes leave stale types in `.react-router/types/app/routes/+types/`
- New properties on interfaces must be added to the type definition

## Important Notes

- Don't try to run Bash(npm run dev) commands, I will do those - just ask me to do it and await my feedback
- Always remember RLS policies for our Supabase databases (local and prod)
- Don't run `supabase db reset` without EXPRESSLY ASKING TO DO SO in CAPITAL LETTERS
- To run database queries, use `docker exec` on the relevant Supabase database container

# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`
- **Application architecture and security implementation** can be found in `./docs/ARCHITECTURE-SECURITY.md` - read this for understanding the secure centralized architecture
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

## Workflow

When you have completed a change, or a small batch of changes, always follow this process:

- **CRITICAL**: Run `npm run format` first, then `npm run check` (formats, lints, and type checks) and ensure it passes with zero errors
- **Discord Changes**: For Discord-related changes, also run `npm run test:discord` to verify integration
- **DO NOT COMMIT** if `npm run check` fails with any TypeScript errors or linting errors
- **Database Changes**: Use `supabase migrations up` to apply migrations locally, but migrations will be deployed to the production database through the Github Actions pipeline which occurs once we've pushed to `main`
- Await my input to confirm the change has been tested
- Update the ./docs/TODO.md file to mark changes completed
- Stage all files in the repo with `git add .`
- Commit and push

### Pre-Commit Requirements

NEVER commit code that fails type checking or has build errors. Always ensure:

1. `npm run check` passes completely (zero errors)
2. All TypeScript errors are resolved
3. No critical linting errors remain (warnings are acceptable)

## Code Quality Standards

When writing TypeScript code, follow these strict guidelines to avoid linting errors:

- **Avoid inline styles**: In any JavaScript or TypeScript file we create, avoid inline styles. Put them in stylesheets instead
- **No `any` types**: Always use proper TypeScript types. Import `SupabaseClient` type instead of using `any`
- **No unused variables**: Remove or prefix with underscore if intentionally unused
- **Proper type assertions**: Use `as Record<string, string>` for environment variables instead of accessing unknown types directly
- **Import specific types**: Import `{ createClient, SupabaseClient }` instead of just the client

Example of correct typing:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export class EquipmentService {
  constructor(private supabase: SupabaseClient) {}
}

// For environment variables
const envTyped = env as Record<string, string>
```

## Testing

- **Discord Integration**: Complete test suite available via `npm run test:discord`
- **All Tests**: Run `npm test` for full test coverage including Discord functionality
- **Test Location**: Discord tests are in `src/test/discord-simple.test.ts` and `src/controllers/discord.controller.test.ts`
- **Test Summary**: See `src/test/DISCORD_TEST_SUMMARY.md` for comprehensive Discord test coverage details

## Discord Integration

- **Endpoints**: `/api/discord/interactions`, `/api/discord/messages`, `/api/discord/notify`
- **Commands**: Slash commands (`/equipment`, `/player`) and prefix commands (`!equipment`, `!player`)
- **Moderation**: Two-review approval system with Discord button interactions
- **Testing**: Use `npm run test:discord` to verify Discord functionality without requiring live Discord API

## Important Notes

- Don't try to run Bash(npm run dev) commands, I will do those - just ask me to do it and await my feedback
- Always remember RLS policies for our Supabase databases (local and prod)
- Don't run `supabase db reset` without EXPRESSLY ASKING TO DO SO in CAPITAL LETTERS
- To run database queries, use `docker exec` on the relevant Supabase database container

## Code Commit Best Practices

- Always run code quality checks, tests etc, the full works BEFORE trying to commit. We use pre-commit hooks, and ideally we want all code to pass those without having to fix again before committing
- Don't ever disable linting in files

## Authentication Implementation Patterns

**CRITICAL**: Always follow these exact patterns when implementing authentication functionality:

### 1. Database Access Pattern

**ALWAYS use `InternalApiService` for database operations** - never direct Supabase clients in routes:

```typescript
// ✅ CORRECT: Use InternalApiService
const apiService = new InternalApiService(c)
const equipment = await apiService.getEquipment(slug)

// ❌ WRONG: Direct database access
const supabase = createSupabaseClient(env)
const equipment = await equipmentService.getEquipment(slug)
```

### 2. Authentication Middleware Pattern

**Use the appropriate middleware** for different authentication needs:

```typescript
// For required authentication (Bearer token or cookie)
app.use('/admin/*', secureAuth)

// For optional authentication
app.use('/api/data', optionalSecureAuth)

// For admin-only access
app.use('/admin/settings', requireSecureAdmin)

// For CSRF protection on forms
app.post('/submit', requireCSRF, handler)
```

### 3. Route Context Types

**Always use proper context types** with authentication:

```typescript
// ✅ CORRECT: Use EnhancedAuthVariables
app.get('/protected', secureAuth, async (c: Context<{ Variables: EnhancedAuthVariables }>) => {
  const user = c.get('user')
  const isAdmin = c.get('isAdmin')
})

// ❌ WRONG: Generic Variables type
app.get('/protected', async (c: Context) => {
  // Missing type safety
})
```

### 4. Client Creation Pattern

**Use appropriate client types** based on data access needs:

```typescript
class InternalApiService {
  // For public data
  private getPublicClient(): SupabaseClient {
    return this.authService.createServerClient()
  }

  // For user-specific data with RLS
  private async getAuthenticatedClient(): Promise<SupabaseClient> {
    return this.authService.getAuthenticatedClient(this.context)
  }

  // For admin operations only
  private getAdminClient(): SupabaseClient {
    return this.authService.createAdminClient()
  }
}
```

### 5. Error Handling Pattern

**Use consistent error responses** for authentication:

```typescript
// Authentication required
return c.json({ error: 'Authentication token required' }, 401)

// Admin access required
return c.json({ error: 'Admin access required' }, 403)

// CSRF validation failed
return c.json({ error: 'Invalid CSRF token' }, 403)
```

### 6. Cookie Authentication Pattern

**For secure browser authentication** use `CookieAuthService`:

```typescript
// Sign in with secure cookies
const cookieAuth = new CookieAuthService(env)
const result = await cookieAuth.signInWithCookie(c, email, password)

// Validate CSRF tokens
if (!cookieAuth.validateCSRFToken(c, formData.get('csrf_token'))) {
  return c.json({ error: 'Invalid CSRF token' }, 403)
}
```

### 7. Frontend JavaScript Pattern

**Use modular client-side code** from `public/client/`:

```tsx
// ✅ CORRECT: Reference external modules
<script src="/client/auth.js"></script>
<script src="/client/forms.js"></script>

// ❌ WRONG: Inline JavaScript
<script dangerouslySetInnerHTML={{__html: `/* 200+ lines */`}} />
```

### 8. Service Role Restrictions

**ONLY use service role key** for these specific cases:

- Admin operations in `ModerationController`
- Internal admin methods in `InternalApiService`
- Configuration validation

**NEVER use service role key** for:

- SSR routes
- Public data access
- User authentication flows

### 9. Type Safety Requirements

**Always import and use proper types**:

```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import { EnhancedAuthVariables, SecureAuthVariables } from '../types/components'

// Never use 'any' types
const supabase: SupabaseClient = createClient(url, key)
```

### 10. CSRF Implementation

**For all forms with cookie authentication**:

```typescript
// Generate token in service
const csrfToken = cookieAuth.setCSRFToken(c)

// Include in forms
<input type="hidden" name="csrf_token" value={csrfToken} />

// Validate in handlers
if (!cookieAuth.validateCSRFToken(c, formData.get('csrf_token'))) {
  return c.json({ error: 'Invalid CSRF token' }, 403)
}
```

**KEY PRINCIPLE**: Follow the centralized, secure architecture patterns established in the security overhaul. Never bypass `InternalApiService`, always use proper middleware, and maintain type safety throughout.

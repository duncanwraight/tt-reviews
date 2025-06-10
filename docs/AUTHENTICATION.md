# Authentication Architecture

This document outlines the centralized authentication system implemented in the TT Reviews application.

## Overview

The application uses a centralized authentication architecture built around Supabase Auth with JWT tokens. All authentication logic is consolidated into reusable services and middleware to ensure consistency and security across the application.

## Core Components

### 1. AuthWrapperService (`src/services/auth-wrapper.service.ts`)

The central authentication service that provides all auth-related functionality.

**Key Methods:**

- `getAuthContext(c)` - Returns complete auth context (user, token, authenticated client, admin status)
- `getAuthenticatedClient(c)` - Returns Supabase client with user's JWT token for RLS
- `requireAdmin(c)` - Enforces admin access, throws if user is not admin
- `createServerClient()` - Server-side client for public operations
- `createAdminClient()` - Admin client with service role key for bypassing RLS

**Features:**

- Automatic token extraction from Authorization header
- JWT token validation through Supabase
- Admin status checking based on email whitelist
- Proper RLS context with user's access token

### 2. Enhanced Auth Middleware (`src/middleware/auth-enhanced.ts`)

Type-safe middleware that provides full authentication context to controllers.

**Middleware Functions:**

- `enhancedAuth` - Standard authentication requirement
- `requireAdmin` - Admin-only access enforcement
- `optionalAuth` - Optional authentication for mixed endpoints

**Context Variables:**

```typescript
type EnhancedAuthVariables = {
  user: User
  authService: AuthWrapperService
  authContext: AuthContext
}
```

### 3. Database Configuration (`src/config/database.ts`)

Enhanced to support multiple authentication modes:

- **Anonymous client** - For public data access
- **User-authenticated client** - With JWT token for RLS
- **Service role client** - For admin operations bypassing RLS

## Authentication Flow

### 1. Token Extraction

```typescript
// Authorization: Bearer <jwt_token>
const authHeader = c.req.header('Authorization')
const token = authHeader.slice(7) // Remove 'Bearer ' prefix
```

### 2. User Validation

```typescript
const {
  data: { user },
  error,
} = await supabase.auth.getUser(token)
if (error || !user) throw new AuthenticationError('Invalid token')
```

### 3. Admin Check

```typescript
const adminEmails = env.ADMIN_EMAILS.split(',')
const isAdmin = adminEmails.includes(user.email.toLowerCase())
```

### 4. RLS Context

```typescript
// Create client with user's token for proper RLS context
const supabase = createSupabaseClient(env, token)
```

## Usage in Controllers

### Before (Scattered Auth Logic)

```typescript
// Different patterns across controllers - inconsistent!
const authHeader = c.req.header('Authorization')
const token = authHeader?.substring(7)
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
await supabase.auth.setSession({ access_token: token, refresh_token: '' })
```

### After (Centralized Auth)

```typescript
// Consistent pattern across all controllers
const { user, supabase, isAdmin } = await getAuthContext(c)
const service = new PlayerService(supabase) // Already has proper RLS context
```

## Route Protection

### Standard Authentication

```typescript
// src/routes/players.ts
players.post('/:slug/edit', enhancedAuth, PlayersController.editPlayerInfo)
```

### Admin-Only Routes

```typescript
// src/routes/moderation.ts
moderation.use('/*', requireAdmin)
```

### Optional Authentication

```typescript
// For endpoints that work for both authenticated and anonymous users
equipment.get('/:slug', optionalAuth, EquipmentController.getEquipment)
```

## Row-Level Security (RLS)

The authentication system ensures proper RLS context by:

1. **Using User JWT Tokens** - All user operations use their actual JWT token
2. **Proper Client Creation** - `createSupabaseClient(env, userToken)`
3. **Automatic Context** - `auth.uid()` in RLS policies resolves to the authenticated user

### Example RLS Policy

```sql
-- Player edits can only be created by authenticated users
CREATE POLICY "Users can create player edits" ON player_edits
FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## Frontend Authentication

### Token Storage

```javascript
// Session stored in localStorage with full session object
const session = {
  access_token: "jwt_token_here",
  refresh_token: "refresh_token_here",
  user: { ... }
}
localStorage.setItem('session', JSON.stringify(session))
```

### API Requests

```javascript
// Extract token from session for API calls
const session = JSON.parse(localStorage.getItem('session'))
const token = session.access_token

fetch('/api/players/submit', {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
})
```

## Error Handling

### Authentication Errors

- **401 Unauthorized** - Invalid or missing token
- **403 Forbidden** - Valid user but insufficient permissions
- **Token Validation** - Automatic validation through Supabase Auth

### Modal Integration

The auth system integrates with the modal system for user-friendly error messages:

```javascript
showErrorModal('Authentication Required', 'Please log in to submit player data')
```

## Admin Access

### Configuration

Admin access is controlled via environment variable:

```bash
ADMIN_EMAILS=admin@example.com,moderator@example.com
```

### Usage

```typescript
// Automatic admin checking in auth context
const { isAdmin } = await getAuthContext(c)
if (!isAdmin) throw new AuthenticationError('Admin access required')

// Or use the convenience method
await authService.requireAdmin(c) // Throws if not admin
```

## Security Features

1. **JWT Token Validation** - All tokens validated through Supabase Auth
2. **RLS Enforcement** - User context properly passed for database operations
3. **Admin Verification** - Email-based admin access control
4. **Type Safety** - Full TypeScript types for auth context
5. **Centralized Logic** - Single source of truth for all auth operations

## Migration Benefits

The centralized auth system provides:

- ✅ **Consistency** - Same auth pattern across all controllers
- ✅ **Security** - Proper RLS context for all user operations
- ✅ **Maintainability** - Single place to update auth logic
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Error Handling** - Consistent error responses
- ✅ **Testing** - Easy to mock and test auth scenarios

## Files Modified

### Core Authentication

- `src/services/auth-wrapper.service.ts` - Main auth service
- `src/middleware/auth-enhanced.ts` - Enhanced middleware
- `src/config/database.ts` - Multi-mode client creation

### Controllers Updated

- `src/controllers/auth.controller.ts`
- `src/controllers/players.controller.ts`
- `src/controllers/equipment.controller.ts`
- `src/controllers/reviews.controller.ts`
- `src/controllers/moderation.controller.ts`
- `src/controllers/search.controller.ts`

### Routes Updated

- `src/routes/auth.ts`
- `src/routes/players.ts`
- `src/routes/moderation.ts`
- `src/routes/reviews.ts`

This centralized approach ensures secure, consistent, and maintainable authentication throughout the application.

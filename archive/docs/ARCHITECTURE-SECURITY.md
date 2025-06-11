# Application Architecture & Security

This document outlines the secure, centralized authentication and data access architecture implemented in the TT Reviews application after the comprehensive security overhaul.

## 🎉 **ARCHITECTURE OVERVIEW**

The application now follows a **hybrid secure architecture** with:

- **API-First data access** with centralized authentication patterns
- **HTTP-only cookie authentication** alongside Bearer token support
- **CSRF protection** for all state-changing operations
- **Centralized database access** with proper RLS enforcement
- **Modular frontend architecture** with extracted JavaScript modules

## 🔐 **SECURITY IMPROVEMENTS**

### 1. **HTTP-Only Cookie Authentication**

**Files**: `src/services/cookie-auth.service.ts`, `src/middleware/auth-secure.ts`

- **Eliminates XSS vulnerability** from localStorage JWT storage
- **Secure session management** with HTTP-only, SameSite=Strict cookies
- **CSRF protection** with cryptographically secure tokens
- **Dual authentication support**: Bearer tokens (API) + cookies (browser)

**Usage**:

```typescript
// Secure authentication endpoints
POST / api / auth / signin - secure // Sets HTTP-only cookie + CSRF token
POST / api / auth / signout - secure // Clears cookies
GET / api / auth / me - secure // Cookie-based user info
```

### 2. **Centralized Database Access**

**File**: `src/services/internal-api.service.ts`

- **Eliminated direct database access** from SSR routes
- **Consistent authentication patterns** via `AuthWrapperService`
- **Proper RLS enforcement** for all user data operations
- **Minimal service role usage** - only for legitimate admin operations

**Pattern**:

```typescript
// Before: Direct database access in routes
const supabase = createSupabaseClient(env)
const equipment = await equipmentService.getEquipment(slug)

// After: Centralized via InternalApiService
const apiService = new InternalApiService(c)
const equipment = await apiService.getEquipment(slug)
```

### 3. **Enhanced Authentication Middleware**

**Files**: `src/middleware/auth-secure.ts`, `src/middleware/auth-enhanced.ts`

- **Type-safe authentication context** with `SecureAuthVariables`
- **CSRF protection middleware** for state-changing operations
- **Optional authentication** for public/private hybrid endpoints
- **Admin-only access control** with proper authorization

**Middleware Options**:

```typescript
secureAuth // Required auth (cookies or Bearer)
optionalSecureAuth // Optional auth (both auth types)
requireSecureAdmin // Admin-only access
requireCSRF // CSRF protection for forms
```

## 📁 **ARCHITECTURAL PATTERNS**

### Database Access Pattern

**All database operations** now follow this pattern:

```typescript
// 1. Create InternalApiService
const apiService = new InternalApiService(c)

// 2. Use appropriate client type
const equipment = await apiService.getEquipment(slug) // Public data
const stats = await apiService.getModerationStats() // Admin data
```

**Client Types Used**:

- `createServerClient()` - Public data access
- `createAuthenticatedClient(token)` - User-specific data with RLS
- `createAdminClient()` - Admin operations (minimal usage)

### Authentication Flow

**Cookie-based (Secure)**:

1. User signs in → HTTP-only cookie + CSRF token set
2. Subsequent requests → Cookie automatically sent
3. Middleware validates cookie → User context available
4. Forms include CSRF token → CSRF validation

**Bearer Token (API)**:

1. User signs in → JWT token returned to client
2. Client stores token → Sent in Authorization header
3. Middleware validates token → User context available
4. API endpoints → No CSRF required

### Frontend Architecture

**Modular JavaScript** (`public/client/`):

- `auth.js` - Authentication utilities and header management
- `forms.js` - Form handling, CSRF, search, and UI utilities

**Benefits**:

- **Reduced inline JavaScript** from 380+ lines to ~50 lines
- **Reusable utilities** for authentication and form handling
- **Backward compatibility** maintained for existing functionality
- **Security improvements** with dual authentication support

## 🛡️ **SECURITY FEATURES**

### 1. **XSS Protection**

- HTTP-only cookies prevent JavaScript access to auth tokens
- CSRF tokens prevent cross-site request forgery
- Secure cookie flags: `httpOnly: true, secure: true, sameSite: 'Strict'`

### 2. **Proper RLS Enforcement**

- All user data access uses authenticated Supabase clients
- Service role access restricted to admin operations only
- Consistent authentication context across all database operations

### 3. **Authentication Security**

- JWT token validation through Supabase Auth
- Admin access controlled via email whitelist in environment variables
- Token expiry checking with automatic cleanup
- Secure session management with automatic cookie cleanup

### 4. **API Security**

- Consistent authentication middleware across all protected routes
- Proper error handling without sensitive data exposure
- Rate limiting ready (architecture supports implementation)
- Request logging for security audit trails

## 📂 **FILE STRUCTURE**

### **Core Security Files**

```
src/services/
├── cookie-auth.service.ts     # HTTP-only cookie authentication
├── auth-wrapper.service.ts    # Base authentication service
├── internal-api.service.ts    # Centralized database access

src/middleware/
├── auth-secure.ts             # Secure auth + CSRF middleware
├── auth-enhanced.ts           # Enhanced Bearer token middleware

src/controllers/
├── auth.controller.ts         # Auth endpoints (both types)

public/client/
├── auth.js                    # Client-side auth utilities
├── forms.js                   # Form handling utilities
```

### **Updated Application Files**

```
src/app.tsx                    # All SSR routes use InternalApiService
src/routes/auth.ts             # Added secure authentication routes
src/components/ClientScript.tsx # Simplified to ~50 lines
```

## 🔧 **IMPLEMENTATION DETAILS**

### Service Role Key Usage

**Properly Restricted to**:

- Moderation operations in `ModerationController`
- Internal API admin methods in `InternalApiService`
- Configuration and environment validation

**No Longer Used In**:

- SSR routes in `app.tsx`
- Frontend authentication flows
- Public data access operations

### CSRF Protection

**Implementation**:

```typescript
// Generate secure token
const csrfToken = crypto.getRandomValues(new Uint8Array(32))

// Validate in middleware
if (!authService.validateCSRFToken(c, providedToken)) {
  return c.json({ error: 'Invalid CSRF token' }, 403)
}
```

**Coverage**:

- All form submissions from cookie-authenticated users
- State-changing operations (POST, PUT, DELETE)
- Automatic injection for SSR pages with forms

### Error Handling

**Consistent Patterns**:

```typescript
// Authentication errors
return c.json({ error: 'Authentication token required' }, 401)

// Authorization errors
return c.json({ error: 'Admin access required' }, 403)

// CSRF errors
return c.json({ error: 'Invalid CSRF token' }, 403)
```

## 🚀 **BENEFITS ACHIEVED**

### Security

- **Eliminated XSS vulnerability** from localStorage token storage
- **Added CSRF protection** for all forms and state changes
- **Proper RLS enforcement** across all user data operations
- **Minimized service role exposure** to essential admin operations only

### Maintainability

- **Centralized database access** through `InternalApiService`
- **Consistent authentication patterns** across all routes
- **Modular frontend architecture** with reusable utilities
- **Type-safe authentication context** throughout the application

### Performance

- **Reduced inline JavaScript** payload by ~85%
- **Modular loading** of client-side utilities
- **Efficient authentication** with automatic cookie handling
- **Better separation of concerns** between SSR and client-side code

### Developer Experience

- **Clear authentication patterns** for future development
- **Consistent error handling** across all endpoints
- **Type safety** for authentication context
- **Easy testing** with centralized authentication logic

## 🔮 **FUTURE CONSIDERATIONS**

This architecture is now ready for:

- **Rate limiting** implementation on API endpoints
- **Enhanced logging** for security audit trails
- **Session refresh** mechanisms for long-lived sessions
- **Multi-factor authentication** integration
- **OAuth provider** integration (Google, GitHub, etc.)

The comprehensive security overhaul provides a solid foundation for continued development while maintaining the highest security standards.

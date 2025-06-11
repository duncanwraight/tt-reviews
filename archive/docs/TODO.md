# TODO

## Local Environment Setup

- [x] Set up Node.js project with latest versions
- [x] Configure local development environment to match production

## Proof of Concept

- [x] Set up Hono + Cloudflare Workers project structure
- [x] Configure GitHub Actions deployment pipeline with Wrangler
- [x] Create basic app with routing (API + SPA frontend)
- [x] Test SPA routing works correctly with Cloudflare Workers

## UI Framework & Layout

- [x] Create LAYOUT.md documentation with recommended UI structure
- [x] Build global header component with navigation and search
- [x] Implement responsive layout system (desktop/tablet/mobile)
- [x] Create homepage layout with hero section and content areas
- [x] Build search bar component with autocomplete functionality
- [x] Implement equipment review card components
- [x] Create player profile card components
- [x] Build filtering and sorting interface components
- [x] Implement navigation breadcrumbs and cross-references
- [x] Replace About page with Discord OOAK link in header navigation

## Core Features

- [x] Configure Supabase database connection and schema
- [x] Configure local development environment for Supabase
- [x] Add database connection health check endpoint
- [x] Implement basic authentication with Supabase Auth
- [x] Add authentication API endpoints (signup, signin, signout, profile)
- [x] Create authentication middleware for protected routes
- [x] Update frontend with functional login/signup forms
- [x] Add dynamic authentication state to header (Login/Submit Review button)
- [x] Create protected submit review page with logout functionality
- [x] Refactor from embedded HTML strings to enterprise JSX component architecture
- [x] Add Tailwind CSS styling system
- [x] Configure secure environment variable management (.dev.vars)
- [x] Create equipment reviews data model and CRUD operations
- [x] Implement complete review submission and display system
- [x] Add review form with category ratings and reviewer context
- [x] Fix authentication for Row Level Security in review submissions
- [x] Create player profiles data model and CRUD operations
- [x] Implement search functionality (equipment and players)

## Code Quality & Standards

- [x] Establish comprehensive coding standards documentation
- [x] Refactor codebase to align with TypeScript and Hono best practices
- [x] Add proper FC types to all React/JSX components
- [x] Eliminate client-side state management from SSR components
- [x] Convert forms to server-first architecture with progressive enhancement
- [x] Remove inline JavaScript handlers in favor of proper web standards
- [x] Implement proper form handling with method/action attributes
- [x] Fix type safety violations (removed any types from core components)

## Moderation System

- [x] Implement moderation service for review approval/rejection
- [x] Create admin authentication and authorization
- [x] Build admin interface for content moderation
- [x] Add moderation dashboard with pending reviews
- [x] Implement moderation actions (approve/reject/edit)
- [x] Add moderation logging and audit trail

## User Interface Enhancements

- [x] Update header authentication button (Login/Profile/Admin based on auth state)
- [x] Create user profile page with review history
- [x] Add dynamic admin interface detection

## Discord Integration

- [x] Set up Discord bot application and webhook endpoints
- [x] Implement Discord authentication and role-based permissions
- [x] Create notification system for new review submissions to OOAK channel
- [x] Implement two-review approval system with Discord commands
- [x] Add Discord slash commands for equipment search (/equipment query:butterfly)
- [x] Add Discord slash commands for player search (/player query:messi)
- [x] Implement Discord prefix commands for equipment search (!equipment butterfly)
- [x] Implement Discord prefix commands for player search (!player messi)
- [x] Configure role restrictions for search commands
- [x] Add moderation tracking and audit trail for Discord actions
- [x] Create comprehensive test suite for Discord integration (26 tests passing)

## Bugs

- [x] Confirm modal on approving moderation item in admin area doesn't do anything
- [x] When trying to confirm moderation of a review from the admin area, I see an error about requiring a second review. This should only be the case when moderating from Discord; administrators should be able to approve a submission without a second confirmation
      ```
      [2025-06-10T23:22:16.427Z] POST /api/admin/reviews/2bca73ca-e991-4f00-a078-1e3500c1dfcf/approve - START
      Moderation action: approved review 2bca73ca-e991-4f00-a078-1e3500c1dfcf by moderator fa4f22e7-a6be-45da-b108-665d62469607 {
      reviewId: '2bca73ca-e991-4f00-a078-1e3500c1dfcf',
      moderatorId: 'fa4f22e7-a6be-45da-b108-665d62469607',
      action: 'approved',
      reason: undefined,
      timestamp: '2025-06-10T23:22:16.445Z'
      }
      ✘ [ERROR] Error updating review to awaiting second approval: {
      code: '22P02',
      details: null,
      hint: null,
      message: 'invalid input value for enum review_status: "awaiting_second_approval"'
      }

      [2025-06-10T23:22:16.452Z] POST /api/admin/reviews/2bca73ca-e991-4f00-a078-1e3500c1dfcf/approve - 500 (25ms) - Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36
      ```

- [x] When submitting a player change for moderation, even a successful submission displays an error modal
- [x] No log out button anywhere for admins
- [ ] Submitting new Equipment gets a 200 response but doesn't do anything, the form just stays active on the page
- [ ] Approving a new Equipment submission throws an API error: {"error":"Authentication token required","timestamp":"2025-06-11T13:56:02.947Z"}

## Security and application architecture overhaul ✅ COMPLETED

### Architecture Investigation Results ✅

- [x] Completed comprehensive investigation of application architecture
- [x] Identified two conflicting data flow patterns:
  - **SSR Pattern**: Server-side pages access database directly via service keys (equipment pages `app.tsx:85-124`, admin dashboards `app.tsx:279-357`)
  - **API Pattern**: Client-side JavaScript calls `/api/*` endpoints with Bearer tokens (reviews, submissions, authentication)

### Critical Security Issues ✅

- [x] **Fix JWT token storage vulnerability**: Currently stored in localStorage (XSS vulnerable)
  - ✅ Migrated to HTTP-only cookies for auth tokens via `CookieAuthService`
  - ✅ Implemented proper CSRF protection with token validation
  - ✅ Updated `ClientScript.tsx:218-270` authentication functions to use secure auth patterns
- [x] **Audit and restrict service role key usage**: Currently used inconsistently
  - ✅ Admin pages now use centralized `InternalApiService` instead of direct service role access
  - ✅ Equipment legacy endpoints consolidated through service layer
  - ✅ Service role usage minimized to essential admin operations only via `InternalApiService`
- [x] **Implement consistent Row Level Security (RLS) application**
  - ✅ All user operations now go through authenticated clients with proper RLS enforcement
  - ✅ Service role access restricted to `InternalApiService` for admin operations only

### Architecture Standardization ✅

- [x] **Choose primary authentication pattern** - Selected Enhanced SSR with HTTP-only cookies
  - ✅ **Selected Option B - Enhanced SSR**: Server-side session handling with HTTP-only cookies via `CookieAuthService`
  - ✅ Removed hybrid patterns that created security inconsistencies
  - ✅ All authentication now flows through centralized `AuthWrapperService` and `CookieAuthService`
- [x] **Centralize database access patterns**
  - ✅ Eliminated direct Supabase client creation in routes via `InternalApiService`
  - ✅ All database operations through service layer with consistent authentication
  - ✅ Standardized client creation via `AuthWrapperService`
- [x] **Refactor authentication middleware usage**
  - ✅ Removed legacy `auth.ts` middleware in favor of `auth-enhanced.ts` and `auth-secure.ts`
  - ✅ Standardized on `EnhancedAuthVariables` and `SecureAuthVariables` patterns
  - ✅ Implemented secure middleware for admin operations via `requireAdmin`

### Frontend Architecture Cleanup ✅

- [x] **Reduce dangerouslySetInnerHTML usage** (identified in investigation)
  - ✅ `LoginPage.tsx`: Extracted inline JavaScript to modular `/client/auth.js` and `/client/forms.js`
  - ✅ `ProfilePage.tsx`: Added modular script references for authentication
  - ✅ `EquipmentSubmitPage.tsx`: Modularized form handling scripts
  - ✅ Created `/client/styles.css` and `/client/config.js` for reusable functionality
  - ✅ Updated 11 page components to use modular scripts instead of inline code
- [x] **Implement consistent error handling patterns**
  - ✅ Standardized error handling to prevent sensitive data exposure
  - ✅ Generic error messages for configuration issues (`Discord verification key not configured`)
  - ✅ Sanitized environment variable error messages (`Database admin key configuration is required`)
- [x] **Consolidate client-side authentication logic**
  - ✅ `ClientScript.tsx` reduced from 380+ lines to modular approach
  - ✅ Extracted authentication functions to `/client/auth.js` module
  - ✅ Simplified progressive enhancement patterns with external script references

### Database Architecture Improvements ✅

- [x] **Audit all database access patterns**
  - ✅ All services now use centralized `InternalApiService` for database operations
  - ✅ Removed direct client creation patterns in favor of service layer
  - ✅ Legacy patterns in `lib/supabase.ts` maintained for compatibility but not used in new code
- [x] **Add comprehensive logging** for security events and database access
  - ✅ Implemented detailed logging in `InternalApiService` and moderation systems

### Authentication Flow Standardization ✅

- [x] **Update all authentication-dependent components**
  - ✅ Profile page now uses `/client/auth.js` module for consistent authentication
  - ✅ Equipment submission flow uses modular authentication scripts
  - ✅ Admin authentication standardized through `requireAdmin` middleware
- [x] **Implement proper session management**
  - ✅ Replaced localStorage session storage with HTTP-only cookies
  - ✅ Added session refresh mechanisms through `CookieAuthService`
  - ✅ Implemented proper logout across all clients via secure auth patterns

### Architecture Enforcement Testing ✅

- [x] **Create authentication pattern compliance tests** - `src/test/architecture-enforcement.test.ts`
  - ✅ Tests that all API endpoints use consistent auth middleware (enhanced/secure/admin)
  - ✅ Verifies no direct database access bypasses RLS via `InternalApiService` patterns
  - ✅ Ensures service role usage is restricted to admin operations only
  - ✅ Validates Discord webhook authentication via signature verification
- [x] **Implement database access pattern tests**
  - ✅ Tests that routes use `InternalApiService` instead of direct database access
  - ✅ Verifies service role key usage is restricted to essential contexts only
  - ✅ Ensures consistent authentication patterns across all endpoints
- [x] **Add security vulnerability prevention tests**
  - ✅ Tests for sensitive data exposure in error messages
  - ✅ Verifies proper error handling in authentication contexts
  - ✅ Ensures configuration errors don't expose sensitive environment variables
- [x] **Create architectural constraint tests**
  - ✅ Tests that components use modular JavaScript instead of extensive `dangerouslySetInnerHTML`
  - ✅ Verifies new components reference `/client/auth.js`, `/client/forms.js`, or `/client/styles.css`
  - ✅ Ensures proper file structure for security architecture
  - ✅ Tests that architecture documentation is maintained and up-to-date

### Security Architecture Documentation ✅

- [x] **Comprehensive security documentation** - `docs/ARCHITECTURE-SECURITY.md`
  - ✅ HTTP-only cookie authentication implementation
  - ✅ CSRF protection patterns and validation
  - ✅ Centralized database access via `InternalApiService`
  - ✅ Modular JavaScript architecture for XSS prevention
  - ✅ Row Level Security (RLS) enforcement patterns
  - ✅ Service role key usage restrictions and guidelines

## Post-live improvements

- [x] Update moderation interface to support player changes and player new equipment updates
- [x] Allow logged-in users to submit changes to players
- [x] Add "Playing style" and "Born" / "Plays for" (nations) to new player creation
  - Include in submission and frontend interfaces
  - Use flag icons for nations
  - Properly handle birth country vs. represents country distinction (e.g., Wang Yang: born China, represents Slovakia)
- [ ] Add "New Equipment" functionality for logged-in users to submit new equipment
- [ ] Add per-type sponge thicknesses for rubbers
  - E.g. inverted = <1.5mm then each mm up to 2.3, then max
  - Long pips = OX, 0.3mm then each mm up to 1.5
- [ ] Implement all SEO improvements on every application page
- [ ] Create a dynamic sitemap for use with Google Search etc
- [ ] Configure homepage to pull real data from database instead of mock
  - Also get search bar working
- [ ] Check SQL files in root directory, see if they can be removed
- [ ] Fix "Login to Review" button on Equipment detail page (may be an issue for Admins)
- [ ] Update Admin area to allow for configuration of almost everything - players, equipment and also categories for everything that requires a category, like sponge thicknesses and types of rubber
- [ ] On pages where a search bar features, hide the search bar from the top header
  - E.g. home page, search page
- [ ] Implement /equipment/category interface
- [ ] Configure Cloudflare storage for image uploads
  - See information in DECISIONS.md doc
- [ ] Include images as part of new player submission
- [ ] Improve the Discord webhook cards
  - More relevant information
  - Better looking
  - Better support for multiple results
  - Our URL cards don't look very good; no image etc. Can we improve this?

## Optimisations and Code Quality

- [x] ~~We seem to reuse the session checking code in a lot of components. Can we make this DRY?~~ **COMPLETED**: Implemented centralized authentication architecture with AuthWrapperService
- [x] **Replace browser alerts with modal dialogs**: Created reusable Modal component system with success/error/warning/confirmation modals
- [x] **Check the "dangerouslySetInnerHTML" functions in our page components** - ✅ **COMPLETED**:
  - ✅ Extracted inline JavaScript to modular `/client/auth.js`, `/client/forms.js`, `/client/config.js`, `/client/styles.css`
  - ✅ Updated 11 page components to reference external modules instead of inline scripts
  - ✅ Implemented architecture enforcement tests to prevent regression
  - ✅ Maintained component functionality while improving security and maintainability
- [ ] We seem to reuse `fetch()` a lot, do we not need a wrapper function for it to allow easy, DRY requests to our API layer?
- [ ] Are inline styles best practice with Hono JSX?
  - If not, let's remove them

## Security

- [ ] Check all code for security vulnerabilities
- [ ] Run a penetration test on our production application, using all of the frontend routes and API endpoints

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

## Security and application architecture overhaul

### Architecture Investigation Results

- [x] Completed comprehensive investigation of application architecture
- [x] Identified two conflicting data flow patterns:
  - **SSR Pattern**: Server-side pages access database directly via service keys (equipment pages `app.tsx:85-124`, admin dashboards `app.tsx:279-357`)
  - **API Pattern**: Client-side JavaScript calls `/api/*` endpoints with Bearer tokens (reviews, submissions, authentication)

### Critical Security Issues

- [ ] **Fix JWT token storage vulnerability**: Currently stored in localStorage (XSS vulnerable)
  - Migrate to HTTP-only cookies for auth tokens
  - Implement proper CSRF protection
  - Update `ClientScript.tsx:218-270` authentication functions
- [ ] **Audit and restrict service role key usage**: Currently used inconsistently
  - Admin pages bypass RLS: `app.tsx:282` uses service role directly
  - Equipment legacy endpoint: `equipment.controller.ts:73` creates server client
  - Review and minimize service role usage to essential operations only
- [ ] **Implement consistent Row Level Security (RLS) application**
  - Some operations bypass RLS via service role access
  - Ensure all user data access goes through authenticated clients

### Architecture Standardization

- [ ] **Choose primary authentication pattern** (Recommended: API-First)
  - **Option A - API-First**: All data access through `/api/*` endpoints with consistent Bearer token auth
  - **Option B - Enhanced SSR**: Server-side session handling with HTTP-only cookies
  - Remove hybrid patterns that create security inconsistencies
- [ ] **Centralize database access patterns**
  - Eliminate direct Supabase client creation in routes: `app.tsx:90`, `app.tsx:282`
  - All database operations through service layer with consistent authentication
  - Standardize client creation via `AuthWrapperService`
- [ ] **Refactor authentication middleware usage**
  - Current inconsistency: `auth.ts` vs `auth-enhanced.ts` middleware
  - Standardize on `EnhancedAuthVariables` pattern from `auth-enhanced.ts:6-10`
  - Remove legacy `Variables` type from `auth.ts:7-12`

### Frontend Architecture Cleanup

- [ ] **Reduce dangerouslySetInnerHTML usage** (identified in investigation)
  - `LoginPage.tsx:122-241`: 120+ lines of inline JavaScript
  - `ProfilePage.tsx:65-139`: Client-side data fetching in SSR component
  - `EquipmentSubmitPage.tsx:32-119`: Inline form handling scripts
  - Extract to separate client-side modules
- [ ] **Implement consistent error handling patterns**
  - Current mix: JSON responses, modal dialogs, redirects
  - Standardize error handling across `equipment-submissions.controller.ts:126`, form handlers, `ClientScript.tsx:264`
- [ ] **Consolidate client-side authentication logic**
  - `ClientScript.tsx` contains 380+ lines including complex auth state management
  - Extract authentication functions to dedicated auth module
  - Simplify progressive enhancement patterns

### Database Architecture Improvements

- [ ] **Audit all database access patterns**
  - Services creating clients: `equipment.service.ts:4`, `auth-wrapper.service.ts:77`
  - Direct client creation: `config/database.ts:4-23` with multiple patterns
  - Legacy patterns: `lib/supabase.ts:59-82` (appears unused)
- [ ] **Implement request rate limiting** for API endpoints
- [ ] **Add comprehensive logging** for security events and database access

### Authentication Flow Standardization

- [ ] **Update all authentication-dependent components**
  - Profile page API calls: `ProfilePage.tsx:71-85`
  - Equipment submission flow: `EquipmentSubmitPage.tsx:89`
  - Admin authentication checks: Header auth button logic
- [ ] **Implement proper session management**
  - Replace localStorage session storage
  - Add session refresh mechanisms
  - Implement proper logout across all clients

### Simplified Architecture-Focused Testing

- [ ] **Create authentication pattern compliance tests**
  - Test that all API endpoints use consistent auth middleware
  - Verify no direct database access bypasses RLS
  - Ensure service role usage is restricted to admin operations only
  - Validate JWT token handling follows security best practices
- [ ] **Implement database access pattern tests**
  - Test that all user data queries go through authenticated clients
  - Verify service layer consistency across all database operations
  - Ensure RLS policies are properly applied for all user operations
  - Test that admin operations use appropriate authorization checks
- [ ] **Add security vulnerability prevention tests**
  - Test for XSS vulnerabilities in user input handling
  - Verify CSRF protection is applied to state-changing operations
  - Test rate limiting on all public API endpoints
  - Ensure sensitive data is not exposed in error messages
- [ ] **Create architectural constraint tests**
  - Test that new API routes follow consistent pattern (controller → service → database)
  - Verify new components don't use dangerouslySetInnerHTML without justification
  - Ensure new authentication flows use centralized AuthWrapperService
  - Test that error handling follows standardized patterns
- [ ] **Implement integration tests for critical user flows**
  - Authentication: signup → login → access protected resource → logout
  - Content submission: login → submit review → moderation workflow → approval
  - Admin operations: admin login → moderation actions → audit trail verification
  - Discord integration: webhook → moderation → approval → notification

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
- [ ] Check the "dangerouslySetInnerHTML" functions in our page components - is this good practice?
- [ ] We seem to reuse `fetch()` a lot, do we not need a wrapper function for it to allow easy, DRY requests to our API layer?
- [ ] Are inline styles best practice with Hono JSX?
  - If not, let's remove them

## Security

- [ ] Check all code for security vulnerabilities
- [ ] Run a penetration test on our production application, using all of the frontend routes and API endpoints

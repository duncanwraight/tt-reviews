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

## Authentication / architecture concerns

- [ ] I would like to do a proper investigation of the application architecture
  - Does the Frontend directly interact with the database?
  - Does the Frontend authenticate with our API?
  - We should be using the API for DB interactions, and keeping the Frontend for essentially submitting API requests and rendering responses

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

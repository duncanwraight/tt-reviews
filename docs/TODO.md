# TODO

## React Router v7 Migration (Priority: High)

### Core Infrastructure

- [x] **Database Connection**: Port Supabase integration to React Router loaders/actions ✅
  - [x] Create database service layer compatible with React Router context
  - [x] Test RLS policies work with new architecture - confirmed working with `/test-db`

### Authentication & Authorization

- [x] **Auth System**: Migrate from cookie-based to React Router sessions ✅
  - [x] Port authentication service to React Router session management
  - [x] Update middleware patterns for route-level authentication
  - [x] Implement admin role checking in loaders
  - [x] Add CSRF protection for forms
  - [x] **RESOLVED**: Fix authentication architecture conflicts ✅
    - ✅ Fixed conflicting server/client auth by using client-side only approach
    - ✅ Fixed Supabase server client cookie parsing format
    - ✅ Removed server-side action from login route causing 400/500 errors
    - ✅ Simplified login form to use client-side onSubmit handler
    - ✅ Added comprehensive authentication documentation to CLAUDE.md
    - ✅ Added `/debug-auth` route for troubleshooting
    - ✅ Updated environment configuration for tt-reviews.local
  - [x] Complete authentication flow testing - login/signup/logout working ✅

### Page Migration (Systematic Approach)

**Note**: Migrating from existing implementation in `/archive` directory to new React Router v7 structure

### **Routing Architecture** ✅

- [x] **File-Based Routing Migration**: Migrated from explicit route configuration to file-based routing ✅

  - ✅ Installed `@react-router/fs-routes` package
  - ✅ Updated `/app/routes.ts` to use `flatRoutes()` for automatic route discovery
  - ✅ Implemented proper nested route structure with layouts
  - ✅ Fixed equipment route conflicts (`/equipment/submit` vs `/equipment/:slug`)
  - ✅ Created layout pattern: `equipment.tsx` (layout) + `equipment._index.tsx` (content) + `equipment.submit.tsx` (child)
  - ✅ Added comprehensive file-based routing documentation to CLAUDE.md
  - ✅ Consolidated home page from `/home` to `/` (root route in `_index.tsx`)

- [x] **Public Pages** (No auth required):

  - [x] Home page (`/`) - with search functionality ✅
  - [x] Equipment index (`/equipment`) ✅
  - [x] Equipment detail (`/equipment/:slug`) ✅
  - [x] Player index (`/players`) ✅
  - [x] Player detail (`/players/:slug`) ✅
  - [x] Search page (`/search`) ✅

- [x] **User Pages** (Auth required):

  - [x] Login/Signup (`/login`) ✅
  - [x] Profile page (`/profile`) ✅
    - ✅ User dashboard with account information
    - ✅ User review history display
    - ✅ Quick actions sidebar with navigation
    - ✅ Professional component architecture (ProfileInfo, UserReviews, QuickActions)
  - [x] Equipment submit (`/equipment/submit`) ✅
    - ✅ Complete submission form with validation
    - ✅ Authentication protection
    - ✅ Database integration with equipment_submissions table
    - ✅ Success/error handling and user feedback
    - ✅ Navigation integration (main nav + profile quick actions)
  - [x] Player submit (`/players/submit`) ✅
    - ✅ Created nested route structure (players.tsx layout + players.submit.tsx child)
    - ✅ Created player_submissions table with proper RLS policies
    - ✅ Complete submission form with player info and equipment setup
    - ✅ Authentication protection and database integration
    - ✅ Fixed routing conflicts by restructuring players routes
    - ✅ Navigation integration with submit links
  - [x] Player edit (`/players/:slug/edit`) ✅
    - ✅ Created players.$slug.edit.tsx route with authentication protection
    - ✅ Built PlayerEditForm component with validation and change detection
    - ✅ Integrated with existing player_edits table and RLS policies
    - ✅ Navigation integration with edit buttons in player pages

- [x] **Admin Pages** (Admin only): ✅

  - [x] Admin dashboard (`/admin`) ✅
    - ✅ Overview dashboard with submission/edit counts and pending items
    - ✅ Quick action buttons and content statistics
    - ✅ Proper Supabase RBAC with JWT claims and auth hooks
    - ✅ Production-ready role-based access control
  - [x] Admin equipment submissions (`/admin/equipment-submissions`) ✅
    - ✅ List view of all equipment submissions with status badges
    - ✅ Detailed specification display and moderation notes
    - ✅ Action buttons for approve/reject with React Router Forms
    - ✅ Server-side actions for submission moderation
  - [x] Admin player submissions (`/admin/player-submissions`) ✅
    - ✅ List view of all player submissions with complete player info
    - ✅ Equipment setup display and status management
    - ✅ Action buttons for approve/reject with React Router Forms
    - ✅ Server-side actions for submission moderation
  - [x] Admin player edits (`/admin/player-edits`) ✅
    - ✅ List view of all player edit requests with diff display
    - ✅ Integration with players table for context
    - ✅ Action buttons for approve/reject with React Router Forms
    - ✅ Server-side actions for edit moderation

- [x] **Role-Based Access Control (RBAC)**: ✅
  - ✅ Implemented proper Supabase RBAC following official best practices
  - ✅ Created user_roles table with auth hook for JWT claims
  - ✅ Server-side role checking in admin routes using JWT decoding
  - ✅ Frontend role display in Navigation component (Admin vs Profile)
  - ✅ Production-ready pattern avoiding RLS recursion issues
  - ✅ Fixed database migration consistency issues between local and production
  - ✅ Resolved authentication errors and made system fully functional
  - ✅ Removed dependency on service role key for equipment submissions

- [x] **Configurable Categories System**: ✅
  - ✅ Created comprehensive database schema with RLS policies for category management
  - ✅ Built CategoryService class for CRUD operations on categories
  - ✅ Added full admin interface for managing all category types
  - ✅ Converted equipment forms to use dynamic categories with subcategory loading
  - ✅ Updated player forms to use dynamic playing styles and countries with flags
  - ✅ Fixed rubber color system to use forehand/backhand side selection
  - ✅ Seeded database with default categories including 40+ countries with emojis
  - ✅ Added equipment categories (Blade, Rubber), playing styles, and rejection categories
  - ✅ Support parent-child relationships for equipment subcategories

- [x] **UI/UX Improvements**: ✅
  - ✅ Redesigned navigation with purple gradient theme and homepage-specific white styling
  - ✅ Added conditional submit buttons on equipment and players pages for logged-in users
  - ✅ Implemented login banners for non-authenticated users encouraging account creation
  - ✅ Removed "Know of a player missing" footer from players page
  - ✅ Enhanced button styling with hover effects and improved visual hierarchy
  - ✅ Created dynamic styling based on current route (white nav on homepage, purple elsewhere)

## Equipment Review Submission

### Core Review System ✅
- [x] **Review Submission Form**: Create comprehensive review form for equipment ✅
  - [x] Multi-section form with dynamic rating categories based on equipment type ✅
  - [x] Configurable rating system (Speed, Spin, Control for inverted; Disruption, Block Quality for anti-spin, etc.) ✅
  - [x] Text review with reviewer context (playing level, style, testing duration) ✅
  - [x] Equipment selection from existing approved database ✅
  - [x] Image upload for user equipment photos ✅
  - [x] Authentication requirements and duplicate review prevention ✅

- [x] **Review Display & Management**: ✅
  - [x] Review display components for equipment pages (ReviewCard, AverageRatings) ✅
  - [x] Category-based rating breakdown display ✅
  - [x] Average ratings with visual progress bars ✅
  - [x] "Write Review" button integration with authentication flow ✅
  - [ ] User review history in profile sections
  - [ ] Review moderation system for admins
  - [ ] Review voting/helpfulness system
  - [ ] Review filtering and sorting options

- [x] **Review Database Schema**: ✅
  - [x] Equipment reviews table exists with proper relationships ✅
  - [x] Configurable rating categories system with equipment-type-specific categories ✅
  - [x] RLS policies implemented for review access ✅
  - [x] Review status workflow (pending/approved/rejected) with two-approval moderation ✅

## Complete Later (Low Priority)

### API Endpoints (External Integration)

- [ ] Add an API token generation mechanism to the /admin area
  - Allow administrator users to pick another user and generate a token on their behalf
- [ ] **Pure API Routes** (JSON responses with authentication mechanism, using an API token):
  - [ ] `GET /api/equipment/:slug` - Equipment details
  - [ ] `GET /api/players/:slug` - Player details
  - [ ] `GET /api/search` - Search functionality
  - [ ] `POST /api/reviews` - Review submission
  - [ ] `GET /api/reviews/:id` - Review details

### Discord Integration ✅

- [x] **Webhook Endpoints**: All Discord functionality implemented and tested ✅
  - [x] `POST /api/discord/interactions` - Discord slash commands ✅
  - [x] `POST /api/discord/messages` - Message handling ✅
  - [x] `POST /api/discord/notify` - Notifications ✅
- [x] **Port Discord Services**: ✅
  - [x] Migrate `DiscordService` to work with React Router actions ✅
  - [x] Update moderation workflow for new architecture ✅
  - [x] Test Discord command functionality ✅

### Submission System Improvements

- [ ] **User Submission Management**:
  - [ ] Add submissions section to user profiles showing submission status
  - [ ] Display rejection reasons and admin feedback in user profiles
  - [ ] Add submission history with filtering (pending, approved, rejected)
  - [ ] Show submission progress indicators and timestamps

- [ ] **Enhanced Moderation Workflow**:
  - [ ] Require two approvals for submissions (Discord + Admin UI, or two Discord)
  - [ ] Allow admins to add detailed rejection justifications
  - [ ] Implement submission status tracking (pending → under_review → approved/rejected)
  - [ ] Add automatic image cleanup for rejected submissions
  - [ ] Create moderation audit trail for accountability

- [ ] **Discord Integration Enhancements**:
  - [ ] Update Discord bot to support two-approval workflow
  - [ ] Add rejection reason collection via Discord interactions
  - [ ] Sync Discord approvals with database submission status
  - [ ] Add notification system for status changes

### Forms & Validation

- [ ] **Form Components**:
  - [ ] Review submission form with validation
  - [ ] Equipment submission form with image upload
  - [ ] Player creation/edit forms
  - [ ] Search form with filters
- [ ] **Progressive Enhancement**:
  - [ ] Ensure forms work without JavaScript
  - [ ] Add client-side validation for better UX
  - [ ] Implement proper loading states

### Image Handling ✅

- [x] **R2 Integration**: Complete image upload system implemented ✅
  - [x] Port image upload functionality to React Router actions ✅
  - [x] Implement image processing workflows ✅
  - [x] Add image optimization and resizing ✅
  - [x] Create image upload components ✅
  - [x] Integrate with equipment submission forms ✅
  - [x] Integrate with player submission forms ✅
  - [x] Set up AWS S3 SDK for Cloudflare R2 compatibility ✅

### Caching
- [ ] Agree and implement best possible solution for caching when using Cloudflare Workers
  - Our application is very read-heavy, with content that won't be changing regularly

### Performance
  - [ ] Add error boundaries for better UX
  - [ ] Test bundle size and loading performance

### Testing & Quality

- [ ] **Test Migration**:
  - [ ] Port existing test suite to new architecture
  - [ ] Add React Router specific tests
  - [ ] Test SSR/hydration behavior
  - [ ] Validate Discord integration still works

### SEO & Meta Tags

- [ ] **Meta Functions**:
  - [ ] Implement dynamic meta tags for all pages
  - [ ] Port SEO strategy to React Router meta exports
  - [ ] Add structured data and schema markup
  - [ ] Create dynamic sitemap generation

### Development Workflow

- [x] **Build System**: ✅
  - [x] Configure linting for React Router patterns ✅
  - [x] Update build scripts and CI/CD ✅
  - [x] Set up proper TypeScript configuration ✅
  - [x] Configure local development environment ✅

---

## Post-Live Improvements

### Quality Control & User Experience
- [ ] **Duplicate Detection**: Check for existing equipment/players before allowing submission to prevent duplicates
- [ ] **Enhanced Validation**: Verify manufacturer names against known databases, validate country codes, check rating ranges
- [ ] **Submission Guidelines**: Interactive guide showing what makes a good submission with examples and best practices
- [ ] **Image Quality Checking**: Validate image resolution, detect inappropriate content
- [ ] **Draft Submissions**: Allow users to save incomplete submissions and return to them later
- [ ] **Submission Appeals**: Allow users to respond to rejection feedback and resubmit with corrections
- [ ] **Resubmission Workflow**: Enable users to create new submissions based on rejected ones with improvements

## Post-Migration Improvements

### Features (Previous TODO items)

- [x] Create reusable loading/feedback system for async operations (register, sign in, submit equipment)
- [ ] Add "New Equipment" functionality for logged-in users to submit new equipment
- [ ] Add per-type sponge thicknesses for rubbers
  - E.g. inverted = <1.5mm then each mm up to 2.3, then max
  - Long pips = OX, 0.3mm then each mm up to 1.5
- [ ] Update Admin area to allow for configuration of almost everything - players, equipment and also categories for everything that requires a category, like sponge thicknesses and types of rubber
- [ ] On pages where a search bar features, hide the search bar from the top header
  - E.g. home page, search page
- [x] Implement /equipment/category interface
- [ ] Include images as part of new player submission
- [ ] Improve the Discord webhook cards
  - More relevant information
  - Better looking
  - Better support for multiple results
  - Our URL cards don't look very good; no image etc. Can we improve this?

### Completed (Migrated from archive)

- [x] ~~Update moderation interface to support player changes and player new equipment updates~~
- [x] ~~Allow logged-in users to submit changes to players~~
- [x] ~~Add "Playing style" and "Born" / "Plays for" (nations) to new player creation~~

## Security

- [ ] Check all code for security vulnerabilities in new React Router architecture
- [ ] Run a penetration test on production application with new frontend
- [ ] Validate CSRF protection works correctly
- [ ] Test authentication/authorization edge cases

# TODO

## React Router v7 Migration (Priority: High)

### Core Infrastructure
- [x] **Database Connection**: Port Supabase integration to React Router loaders/actions ✅
  - [x] Create database service layer compatible with React Router context
  - [x] Test RLS policies work with new architecture - confirmed working with `/test-db`

### Authentication & Authorization  
- [⚠️] **Auth System**: Migrate from cookie-based to React Router sessions (PARTIAL)
  - [x] Port authentication service to React Router session management
  - [x] Update middleware patterns for route-level authentication  
  - [x] Implement admin role checking in loaders
  - [x] Add CSRF protection for forms
  - [ ] **BLOCKER**: Fix Supabase local development email confirmation issues
    - Issue: Local Supabase still requiring email verification despite `enable_confirmations = false` in config.toml
    - Config changes attempted: Set `enable_confirmations = false` and `double_confirm_changes = false`
    - Restarted Supabase local instance - issue persists
    - Need to investigate: Alternative approaches (manual confirmation, test user setup, config override)
  - [ ] Complete authentication flow testing once email confirmation resolved

### Page Migration (Systematic Approach)
- [ ] **Public Pages** (No auth required):
  - [ ] Home page (`/`) - with search functionality
  - [ ] Equipment index (`/equipment`)
  - [ ] Equipment detail (`/equipment/:slug`)
  - [ ] Player index (`/players`) 
  - [ ] Player detail (`/players/:slug`)
  - [ ] Search page (`/search`)

- [ ] **User Pages** (Auth required):
  - [ ] Login/Signup (`/login`)
  - [ ] Profile page (`/profile`)
  - [ ] Equipment submit (`/equipment/submit`)
  - [ ] Player submit (`/players/submit`)
  - [ ] Player edit (`/players/:slug/edit`)

- [ ] **Admin Pages** (Admin only):
  - [ ] Admin dashboard (`/admin`)
  - [ ] Admin reviews (`/admin/reviews`)
  - [ ] Admin equipment submissions (`/admin/equipment-submissions`)
  - [ ] Admin player edits (`/admin/player-edits`)

### API Endpoints (External Integration)
- [ ] **Pure API Routes** (JSON responses):
  - [ ] `GET /api/equipment/:slug` - Equipment details
  - [ ] `GET /api/players/:slug` - Player details
  - [ ] `GET /api/search` - Search functionality
  - [ ] `POST /api/reviews` - Review submission
  - [ ] `GET /api/reviews/:id` - Review details

### Discord Integration
- [ ] **Webhook Endpoints**: 
  - [ ] `POST /api/discord/interactions` - Discord slash commands
  - [ ] `POST /api/discord/messages` - Message handling  
  - [ ] `POST /api/discord/notify` - Notifications
- [ ] **Port Discord Services**:
  - [ ] Migrate `DiscordService` to work with React Router actions
  - [ ] Update moderation workflow for new architecture
  - [ ] Test Discord command functionality

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

### Image Handling
- [ ] **R2 Integration**:
  - [ ] Port image upload functionality to React Router actions
  - [ ] Implement image processing workflows
  - [ ] Add image optimization and resizing
  - [ ] Create image upload components

### Testing & Quality
- [ ] **Test Migration**:
  - [ ] Port existing test suite to new architecture
  - [ ] Add React Router specific tests
  - [ ] Test SSR/hydration behavior
  - [ ] Validate Discord integration still works
- [ ] **Performance**:
  - [ ] Implement proper caching strategies
  - [ ] Add error boundaries for better UX
  - [ ] Test bundle size and loading performance

### SEO & Meta Tags
- [ ] **Meta Functions**:
  - [ ] Implement dynamic meta tags for all pages
  - [ ] Port SEO strategy to React Router meta exports
  - [ ] Add structured data and schema markup
  - [ ] Create dynamic sitemap generation

### Development Workflow
- [ ] **Build System**:
  - [ ] Configure linting for React Router patterns
  - [ ] Update build scripts and CI/CD
  - [ ] Set up proper TypeScript configuration
  - [ ] Configure local development environment

---

## Post-Migration Improvements

### Features (Previous TODO items)
- [ ] Add "New Equipment" functionality for logged-in users to submit new equipment
- [ ] Add per-type sponge thicknesses for rubbers
  - E.g. inverted = <1.5mm then each mm up to 2.3, then max
  - Long pips = OX, 0.3mm then each mm up to 1.5
- [ ] Update Admin area to allow for configuration of almost everything - players, equipment and also categories for everything that requires a category, like sponge thicknesses and types of rubber
- [ ] On pages where a search bar features, hide the search bar from the top header
  - E.g. home page, search page
- [ ] Implement /equipment/category interface
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
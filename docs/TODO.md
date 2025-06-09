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
- [ ] Create equipment reviews data model and CRUD operations
- [ ] Create player profiles data model and CRUD operations
- [ ] Implement search functionality (equipment and players)

## Integration

- [ ] Set up Discord webhook integration for moderation

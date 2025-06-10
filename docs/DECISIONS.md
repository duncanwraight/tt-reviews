# DECISIONS

## TECH STACK

**Selected Architecture: Hono + Supabase**

### Frontend & API

- **Framework**: Hono - Full-stack JS framework designed for edge runtimes
- **Frontend**: Hono JSX - Server-side rendered components within Workers
- **Hosting**: Cloudflare Workers - Serves both API endpoints and frontend (SSR)
- **Benefits**: Single deployment target, global edge performance, component-based architecture, perfect SEO

### Database & Authentication

- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Benefits**: Mature PostgreSQL with full-text search, generous free tier, built-in auth system

### Integration Points

- **Discord Moderation**: Cloudflare Workers handle webhook endpoints
  - Outbound: Workers send Discord webhooks on content submission
  - Inbound: Discord interactions → Workers endpoints → Supabase updates
- **Image Storage**: Supabase Storage for player/equipment photos

## Discord Integration

**Architecture**: Same Worker Integration

- Discord bot functionality implemented as webhook endpoints within existing Cloudflare Worker
- No separate deployment or persistent connections required
- Leverages existing database connections and authentication infrastructure

**Authentication**: Role-Based Moderation

- Discord server roles determine moderation permissions
- Specific role IDs configured in worker environment variables
- Bot validates user roles before allowing moderation commands
- Supports multiple permission levels (e.g., Moderator, Admin roles)

**Notification System**: OOAK Discord Channel Integration

- New review submissions automatically posted to designated moderation channel
- Include review content, rating, equipment details, and quick action buttons
- Moderators use slash commands or reactions to approve/reject submissions
- Bot updates database via existing API endpoints and responds with confirmation

**Moderation Requirements**: Two-Review Approval System

- All submissions require approval from two different moderators before going live
- Prevents single-point-of-failure in content moderation
- Tracks which moderators approved each submission for accountability
- First approval moves submission to "pending second review" state
- Second approval publishes the review to the public site

### Alternative Considered

- **Pure Cloudflare**: Hono + D1 database + custom auth
- **Rejected because**: D1 is still maturing, lacks advanced features like full-text search that are critical for equipment/player search functionality

### Cost Structure

- **Initial**: Free tier for both Cloudflare Workers and Supabase
- **Scale**: Predictable pricing as usage grows
- **Accounts**: Two accounts (Cloudflare + Supabase) - minimal vendor management

### Key Requirements Addressed

- Read-heavy application with excellent caching (Workers + edge deployment)
- Global accessibility (Cloudflare's global network)
- Discord integration for community moderation
- Robust search capabilities (PostgreSQL full-text search)
- Local/production environment parity (both services have local development options)
- SEO-optimized server-side rendering (Hono JSX components)
- Maintainable component-based architecture (eliminates template strings)

### Frontend Architecture Decision

**Hono JSX over Separate Frontend Framework**

- **Considered**: Astro, Next.js, Vite + SPA
- **Selected**: Hono JSX components within existing Workers deployment
- **Rationale**:
  - Single deployment maintains architectural simplicity
  - Server-side rendering ensures perfect SEO for content-heavy site
  - No bundle size constraints from separate framework
  - Component-based architecture without deployment complexity
  - Type-safe JSX integrates seamlessly with TypeScript backend

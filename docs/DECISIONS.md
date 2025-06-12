# DECISIONS

## TECH STACK

**Selected Architecture: React Router v7 + Supabase**

### Frontend & API

- **Framework**: React Router v7 (formerly Remix) - Full-stack React framework for Cloudflare Workers
- **Frontend**: React with server-side rendering and file-based routing
- **Hosting**: Cloudflare Workers - Unified full-stack deployment
- **Benefits**: Modern React patterns, type-safe full-stack development, automatic code splitting, progressive enhancement

### Database & Authentication

- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with client-side implementation
- **Benefits**: Mature PostgreSQL with full-text search, generous free tier, built-in auth system
- **Auth Architecture**: Client-side only authentication for React Router compatibility (see CLAUDE.md)

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
- **Note**: Discord auth is separate from main app Supabase authentication

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

**Search Commands**: Dual Command System

- **Prefix Commands**: `!player messi`, `!equipment butterfly` - Quick searches for power users
- **Slash Commands**: `/player query:messi`, `/equipment query:butterfly` - Discoverable interface for new users
- **Permission Requirements**:
  - Verified bots (100+ servers) need Message Content Intent for prefix commands (difficult approval)
  - Unverified bots can use prefix commands freely
  - Slash commands work for all bot types without special permissions
- **Implementation Strategy**: Support both command types for maximum user flexibility
- **Role Restrictions**: Search commands limited to users with specific Discord roles (configured via environment variables)

**Implementation Status**: Complete ✅

- All Discord functionality implemented and tested (26 tests passing)
- Comprehensive test suite validates integration without requiring live Discord API
- Full documentation available in `./docs/DISCORD-INTEGRATION.md`
- Test commands: `npm run test:discord` and `npm run check:discord`

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

**React Router v7 Migration (January 2025)**

- **Previous**: Hono JSX with inline JavaScript and hybrid SSR/client architecture
- **Current**: React Router v7 (Remix) on Cloudflare Workers
- **Migration Rationale**:
  - **Eliminates inline JavaScript**: Removed 200+ lines of `dangerouslySetInnerHTML` code
  - **Type-safe full-stack**: End-to-end TypeScript from database to UI
  - **Modern React patterns**: Proper component composition, hooks, and state management
  - **Better DX**: Hot module replacement, proper error boundaries, loading states
  - **Security improvements**: No XSS vulnerabilities from inline scripts
  - **Maintainable architecture**: File-based routing with co-located data loading
  - **Progressive enhancement**: Works without JavaScript, enhances with it
  - **API endpoints**: Same routes serve both JSON (for external apps) and HTML (for browsers)
  - **Authentication architecture**: Client-side only Supabase auth eliminates server/client conflicts

### Implementation Benefits

- **Unified deployment**: Frontend, backend, and API in single Worker
- **Automatic optimization**: Code splitting, tree shaking, and bundling via Vite
- **Better performance**: Proper caching, static asset optimization
- **Developer experience**: React dev tools, TypeScript intellisense, proper debugging

## Image Storage

**Selected Solution: Cloudflare R2**

### Decision Rationale

- **Cost-Effective**: 10GB storage + 1M Class A + 10M Class B operations free tier
- **No Egress Fees**: Unlike AWS S3, no charges for image serving
- **Perfect Integration**: Native compatibility with Cloudflare Workers for resizing
- **Global Performance**: CDN integration for fast worldwide image delivery

### Image Size Strategy

**Recommended Dimensions:**

- **Player profile photos**: 300×300px (displayed at 144×144px for retina support)
- **Equipment header photos**: 600×600px (square aspect, responsive display)
- **Additional photos**: 800×600px (standard landscape format)

**Processing Approach:**

- Store original uploads in R2
- Use Cloudflare Workers for on-demand resizing/optimization
- Predetermined sizes for consistent UI experience
- Automatic format conversion (WebP when supported)

### Implementation Plan

**Environment Setup:**

- Development bucket: `tt-reviews-dev` (configured in .dev.vars)
- Production bucket: `tt-reviews-prod` (to be created with separate API token)
- Environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

**File Restrictions:**

- Max file size: Based on R2 limits (up to 5TB per object)
- Supported formats: JPEG, PNG, WebP
- Upload validation via MIME type checking

**Status**: Development environment configured ✅, implementation pending

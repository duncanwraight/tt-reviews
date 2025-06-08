# DECISIONS

## TECH STACK

**Selected Architecture: Hono + Supabase**

### Frontend & API

- **Framework**: Hono - Full-stack JS framework designed for edge runtimes
- **Hosting**: Cloudflare Workers - Serves both API endpoints and frontend (SSR/SSG)
- **Benefits**: Single deployment target, global edge performance, built-in JSX support

### Database & Authentication

- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Benefits**: Mature PostgreSQL with full-text search, generous free tier, built-in auth system

### Integration Points

- **Discord Moderation**: Cloudflare Workers handle webhook endpoints
  - Outbound: Workers send Discord webhooks on content submission
  - Inbound: Discord interactions → Workers endpoints → Supabase updates
- **Image Storage**: Supabase Storage for player/equipment photos

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

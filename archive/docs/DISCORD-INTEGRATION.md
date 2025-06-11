# Discord Integration Documentation

This document provides comprehensive information about the Discord integration implementation for the TT Reviews platform.

## Overview

The Discord integration enables community moderation and search functionality directly from Discord servers. It supports both slash commands and prefix commands, implements a two-review approval system, and provides real-time notifications for new review submissions.

## Architecture

### Integration Method

- **Type**: Webhook-based integration within existing Cloudflare Worker
- **No Separate Deployment**: Discord functionality is embedded in the main application
- **Shared Infrastructure**: Uses existing database connections and authentication

### Core Components

```
src/
├── routes/discord.ts              # Discord API endpoints
├── controllers/discord.controller.ts  # Request handling logic
├── services/discord.service.ts   # Core Discord business logic
├── services/moderation.service.ts # Two-review approval system
└── test/
    ├── discord-simple.test.ts     # Core functionality tests
    ├── discord-integration.test.ts # Integration tests
    └── DISCORD_TEST_SUMMARY.md    # Test coverage documentation
```

## API Endpoints

### `/api/discord/interactions` (POST)

- **Purpose**: Handles Discord slash commands and button interactions
- **Authentication**: Discord signature verification (Ed25519)
- **Supported Interactions**:
  - Ping challenges (type 1)
  - Application commands/slash commands (type 2)
  - Message components/buttons (type 3)

### `/api/discord/messages` (POST)

- **Purpose**: Processes Discord prefix commands
- **Authentication**: Role-based permissions
- **Supported Commands**: `!equipment`, `!player`

### `/api/discord/notify` (POST)

- **Purpose**: Sends webhook notifications to Discord channels
- **Usage**: Called automatically when new reviews are submitted
- **Notification Types**: `new_review`, `review_approved`, `review_rejected`

## Supported Commands

### Slash Commands

- `/equipment query:butterfly` - Search for equipment
- `/player query:messi` - Search for players
- `/approve review-id` - Approve a review (moderators only)
- `/reject review-id` - Reject a review (moderators only)

### Prefix Commands

- `!equipment butterfly` - Quick equipment search
- `!player messi` - Quick player search

### Interactive Buttons

- **Approve Button**: Appears on new review notifications
- **Reject Button**: Appears on new review notifications
- **Custom IDs**: `approve_review-123`, `reject_review-123`

## Two-Review Approval System

### Workflow

1. **New Review Submitted** → Discord notification sent to OOAK channel
2. **First Moderator Approval** → Review status: `pending` → `awaiting_second_approval`
3. **Second Moderator Approval** → Review status: `awaiting_second_approval` → `approved`
4. **Review Published** → Appears on public site

### Safeguards

- ✅ **Duplicate Prevention**: Same moderator cannot approve twice
- ✅ **Different Moderators Required**: Ensures independent review
- ✅ **Audit Trail**: All moderation actions are logged
- ✅ **Status Tracking**: Clear progression through approval states

### Rejection Handling

- Any moderator can reject a review at any stage
- Rejection immediately moves review to `rejected` status
- Rejected reviews do not appear on the public site

## Permission System

### Role-Based Access Control

- **Environment Variable**: `DISCORD_ALLOWED_ROLES`
- **Format**: Comma-separated Discord role IDs (`role1,role2,role3`)
- **Default Behavior**: If no roles configured, all users allowed
- **Validation**: Checked on every command execution

### Permission Levels

- **Search Commands**: Restricted to configured roles
- **Moderation Commands**: Same role restrictions as search
- **Button Interactions**: Role validation on click

## Environment Configuration

### Required Variables

```env
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook
DISCORD_ALLOWED_ROLES=role_id_1,role_id_2
SITE_URL=https://your-domain.com
```

### Optional Variables

```env
# If not set, Discord features will be disabled gracefully
DISCORD_WEBHOOK_URL=optional_webhook_url
DISCORD_ALLOWED_ROLES=optional_role_restrictions
```

## Search Functionality

### Equipment Search

- **Query**: Equipment name, manufacturer, or category
- **Results Format**:

  ```
  🏓 **Equipment Search Results for "butterfly"**

  **Butterfly Tenergy 05** by Butterfly
  Type: rubber
  https://tt-reviews.local/equipment/butterfly-tenergy-05

  **Butterfly Viscaria** by Butterfly
  Type: blade
  https://tt-reviews.local/equipment/butterfly-viscaria
  ```

- **Limit**: Top 5 results with pagination indicator

### Player Search

- **Query**: Player name or partial name
- **Results Format**:

  ```
  🏓 **Player Search Results for "ma long"**

  **Ma Long**
  Status: Active
  https://tt-reviews.local/players/ma-long
  ```

- **Status Display**: Active/Inactive based on player data

### Empty Results

- **Equipment**: `🔍 No equipment found for "query"`
- **Players**: `🔍 No players found for "query"`

## Notification System

### New Review Notifications

- **Trigger**: Automatically sent when review is submitted
- **Channel**: Configured OOAK Discord channel
- **Format**: Rich embed with equipment details and action buttons

#### Embed Structure

```json
{
  "title": "🆕 New Review Submitted",
  "description": "A new review has been submitted and needs moderation.",
  "color": 0x3498db,
  "fields": [
    { "name": "Equipment", "value": "Butterfly Tenergy 05", "inline": true },
    { "name": "Rating", "value": "8/10", "inline": true },
    { "name": "Reviewer", "value": "user@example.com", "inline": true }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Action Buttons

- **Approve Button**: Green button with `approve_review-123` custom ID
- **Reject Button**: Red button with `reject_review-123` custom ID

## Testing

### Test Coverage: 26 Tests Passing ✅

#### Core Functionality Tests (`discord-simple.test.ts`)

- Equipment/player search result formatting
- Discord webhook notification payload creation
- Permission system validation
- Two-review approval logic
- Interaction type parsing
- Signature verification

#### Controller Tests (`discord.controller.test.ts`)

- Endpoint request/response handling
- Error handling and status codes
- Security validation
- Notification routing

### Running Tests

```bash
# Discord-specific tests
npm run test:discord

# All tests including Discord
npm test

# Full check with Discord tests
npm run check:discord
```

### Test Benefits

- ✅ **No Live API Required**: Tests run without Discord API connections
- ✅ **Comprehensive Coverage**: All major functionality and edge cases
- ✅ **Fast Execution**: 26 tests complete in < 30ms
- ✅ **Reliable**: Consistent results across environments

## Error Handling

### Signature Verification

- **Missing Headers**: Returns 401 with "Missing signature headers"
- **Invalid Signature**: Returns 401 with "Invalid signature"
- **Malformed Data**: Returns 400 with specific error message

### Permission Errors

- **Unauthorized User**: Ephemeral "You do not have permission" message
- **Missing Role Data**: Graceful denial of access
- **Unknown Commands**: "Unknown command" response

### Database Errors

- **Connection Issues**: Fallback error messages
- **Query Failures**: Logged errors with user-friendly responses
- **Data Validation**: Proper error status codes

## Integration with Review System

### Automatic Notifications

```typescript
// In review creation controller
if (env.DISCORD_WEBHOOK_URL) {
  await discordService.notifyNewReview({
    id: review.id,
    equipment_name: equipment.name,
    overall_rating: body.overall_rating,
    reviewer_name: user.email,
  })
}
```

### Moderation Actions

```typescript
// Discord button click triggers
const result = await moderationService.approveReview(reviewId, userId)
// Returns: { success: boolean, status: string, message: string }
```

## Security Considerations

### Signature Verification

- **Algorithm**: Ed25519 cryptographic verification
- **Implementation**: Uses Web Crypto API in Cloudflare Workers
- **Protection**: Prevents unauthorized webhook calls

### Role-Based Security

- **Guild Verification**: Commands only work in configured Discord servers
- **Role Validation**: User roles checked against whitelist
- **Audit Logging**: All moderation actions logged with moderator ID

### Input Validation

- **Query Sanitization**: Search queries are validated and limited
- **ID Validation**: Review IDs validated before database operations
- **Rate Limiting**: Inherent through Discord's interaction system

## Performance

### Response Times

- **Search Commands**: < 100ms typical response
- **Button Interactions**: < 50ms typical response
- **Webhook Notifications**: < 200ms delivery time

### Scalability

- **Stateless Design**: No persistent connections or state
- **Edge Deployment**: Runs on Cloudflare's global network
- **Database Efficiency**: Optimized queries with proper indexing

## Monitoring and Debugging

### Logging

- **Console Logs**: All Discord interactions logged
- **Error Tracking**: Comprehensive error logging
- **Moderation Audit**: All approval/rejection actions tracked

### Health Checks

- **Endpoint Status**: `/api/health` includes Discord connectivity
- **Environment Validation**: Startup checks for required configuration
- **Graceful Degradation**: Discord features disabled if misconfigured

## Future Enhancements

### Planned Features

- [ ] Database-backed moderation audit trail (currently console-logged)
- [ ] Advanced search filters in Discord commands
- [ ] Scheduled digest notifications
- [ ] Multi-server support with per-guild configuration

### Considerations

- **Rate Limits**: Discord API rate limiting for high-volume servers
- **Command Registration**: Slash commands need registration via Discord Developer Portal
- **Webhook Management**: Webhook URL rotation and security

---

## Quick Reference

### Key Files

- `src/services/discord.service.ts` - Core Discord logic
- `src/controllers/discord.controller.ts` - HTTP request handling
- `src/services/moderation.service.ts` - Two-review approval system
- `src/test/DISCORD_TEST_SUMMARY.md` - Complete test documentation

### Test Commands

```bash
npm run test:discord      # Discord tests only
npm run check:discord     # Full check including Discord tests
npm test                  # All tests
```

### Environment Setup

```env
DISCORD_PUBLIC_KEY=discord_app_public_key
DISCORD_WEBHOOK_URL=discord_webhook_url
DISCORD_ALLOWED_ROLES=role1,role2,role3
SITE_URL=https://your-domain.com
```

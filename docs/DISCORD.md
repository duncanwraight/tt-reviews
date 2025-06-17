# Discord Integration

## Moderation Workflow

### 1. Button Interactions (Primary Method)

When submissions are made, Discord automatically sends embed messages with interactive buttons:

- **Equipment submissions**: Green "Approve Equipment" / Red "Reject Equipment" buttons
- **Player submissions**: Green "Approve Player" / Red "Reject Player" buttons
- **Player edits**: Green "Approve Edit" / Red "Reject Edit" buttons

Moderators simply click the buttons to approve/reject submissions.

### 2. Slash Commands (Alternative Method)

- `/approve <id>` - Approve a submission by ID
- `/reject <id>` - Reject a submission by ID

### 3. Search Commands

- `/equipment <query>` - Search equipment database
- `/player <query>` - Search player database

## Permission System

Only users with configured Discord roles can moderate:

- Set via `DISCORD_ALLOWED_ROLES` environment variable (comma-separated role IDs)
- If no roles configured, all users are allowed

## Two-Approval Workflow

1. **First approval**: Status becomes "awaiting_second_approval"
2. **Second approval**: Status becomes "approved" and changes are applied
3. Discord provides feedback about approval status after each action

## Workflow Summary

1. User submits content → Discord webhook sends embed with buttons
2. Moderator clicks "Approve" button → First approval recorded
3. Another moderator clicks "Approve" → Second approval recorded, content published

## Environment Variables

- `DISCORD_PUBLIC_KEY` - Discord application public key for signature verification
- `DISCORD_WEBHOOK_URL` - Webhook URL for sending notifications
- `DISCORD_ALLOWED_ROLES` - Comma-separated Discord role IDs that can moderate

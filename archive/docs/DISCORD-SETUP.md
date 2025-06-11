# Discord Bot Setup Guide

This guide walks you through setting up the Discord bot from the Discord perspective to make the TT Reviews Discord integration functional.

## Prerequisites

- Discord account with server admin permissions
- Access to Discord Developer Portal
- Deployed TT Reviews application with Discord endpoints

## Step 1: Create Discord Application & Bot

### 1.1 Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Name your application: `TT Reviews Bot`
4. Go to the **"Bot"** section in the left sidebar
5. Click **"Add Bot"** to create a bot user
6. **Copy the Bot Token** (save this securely - you can only view it once)

### 1.2 Get Required Keys

Copy these values from the Discord Developer Portal:

```env
# From General Information tab
DISCORD_PUBLIC_KEY=your_application_public_key

# From Bot tab
DISCORD_BOT_TOKEN=your_bot_token
```

⚠️ **Security Note**: Never commit these tokens to version control. Add them to your environment variables or `.env` files.

## Step 2: Configure Bot Permissions

### 2.1 Required Bot Permissions

In the **Bot** section, enable these permissions:

- ✅ **Send Messages** - To respond to commands
- ✅ **Use Slash Commands** - For `/equipment` and `/player` commands
- ✅ **Read Message History** - For prefix commands like `!equipment`
- ✅ **Add Reactions** - For button interactions
- ✅ **Embed Links** - For rich notification embeds

### 2.2 Generate Bot Invite URL

1. Go to **OAuth2 > URL Generator**
2. Select **Scopes**: `bot` and `applications.commands`
3. Select **Bot Permissions**: (all permissions listed above)
4. Copy the generated URL
5. Use this URL to invite the bot to your Discord server

## Step 3: Register Slash Commands

### 3.1 Command Registration Script

Create this script to register slash commands with Discord:

```typescript
// scripts/register-discord-commands.ts
const APPLICATION_ID = 'your_application_id'
const BOT_TOKEN = 'your_bot_token'

const commands = [
  {
    name: 'equipment',
    description: 'Search for table tennis equipment',
    options: [
      {
        name: 'query',
        description: 'Equipment name or manufacturer to search for',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'player',
    description: 'Search for table tennis players',
    options: [
      {
        name: 'query',
        description: 'Player name to search for',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'approve',
    description: 'Approve a review (moderators only)',
    options: [
      {
        name: 'review_id',
        description: 'ID of the review to approve',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'reject',
    description: 'Reject a review (moderators only)',
    options: [
      {
        name: 'review_id',
        description: 'ID of the review to reject',
        type: 3, // STRING
        required: true,
      },
    ],
  },
]

// Register commands globally
async function registerCommands() {
  const response = await fetch(
    `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    }
  )

  if (response.ok) {
    console.log('✅ Commands registered successfully')
  } else {
    console.error('❌ Failed to register commands:', await response.text())
  }
}

registerCommands()
```

### 3.2 Run Command Registration

```bash
# Execute the script to register commands
node scripts/register-discord-commands.js
```

**Note**: Global commands can take up to 1 hour to appear. For immediate testing, use guild-specific commands by replacing the URL with:

```
https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands
```

## Step 4: Set Up Webhook for Notifications

### 4.1 Create Discord Webhook

1. Go to your Discord server
2. Navigate to your **OOAK moderation channel** (or create one)
3. Go to **Channel Settings > Integrations > Webhooks**
4. Click **"Create Webhook"**
5. Name it: `TT Reviews Notifications`
6. **Copy the Webhook URL**

### 4.2 Save Webhook URL

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdef...
```

## Step 5: Configure Server Roles

### 5.1 Create Moderation Roles

1. Go to **Server Settings > Roles**
2. Create roles for moderation access:
   - `OOAK Moderator`
   - `OOAK Admin`
   - `TT Reviews Team`

### 5.2 Get Role IDs

1. Enable **Developer Mode** in Discord settings (User Settings > Advanced > Developer Mode)
2. Right-click each role in Server Settings > Roles
3. Click **"Copy ID"**
4. Save the role IDs:

```env
DISCORD_ALLOWED_ROLES=123456789012345678,987654321098765432,555666777888999000
```

## Step 6: Set Interaction Endpoint URL

### 6.1 Configure Interactions Endpoint

1. In Discord Developer Portal, go to **General Information**
2. Set **Interactions Endpoint URL** to:
   ```
   https://your-domain.com/api/discord/interactions
   ```
3. Click **"Save Changes"**
4. Discord will send a verification request to test the endpoint

### 6.2 Verification Process

- Discord will send a `POST` request with `type: 1` (ping)
- Your application should respond with `{"type": 1}`
- If verification fails, check that your endpoint is accessible and responding correctly

## Step 7: Message Content Intent (for Prefix Commands)

### 7.1 Enable Message Content Intent

1. Go to **Bot** section in Developer Portal
2. Scroll down to **Privileged Gateway Intents**
3. Enable **Message Content Intent**

### 7.2 Verification Requirements

- **Unverified bots** (< 100 servers): Can use this intent freely
- **Verified bots** (100+ servers): Must apply for approval and justify the need

**Note**: This intent is required for prefix commands like `!equipment`. If you only want slash commands, you can skip this step.

## Step 8: Complete Environment Configuration

### 8.1 Required Environment Variables

Add all Discord configuration to your environment:

```env
# Discord Application Settings
DISCORD_PUBLIC_KEY=your_application_public_key
DISCORD_BOT_TOKEN=your_bot_token

# Discord Server Configuration
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook
DISCORD_ALLOWED_ROLES=role_id_1,role_id_2,role_id_3

# Application Settings
SITE_URL=https://your-domain.com
```

### 8.2 Deploy Configuration

- Add these variables to your Cloudflare Workers environment
- Update your `.dev.vars` file for local development
- Ensure all variables are properly set before testing

## Step 9: Test the Integration

### 9.1 Basic Functionality Tests

Test each component individually:

1. **Bot Online Status**

   ```
   ✅ Bot appears online in Discord server member list
   ```

2. **Slash Commands**

   ```
   ✅ Type "/" in Discord and verify commands appear
   ✅ Test: /equipment butterfly
   ✅ Test: /player ma long
   ```

3. **Prefix Commands** (if Message Content Intent enabled)

   ```
   ✅ Test: !equipment butterfly
   ✅ Test: !player ma long
   ```

4. **Webhook Notifications**

   ```bash
   # Test webhook endpoint
   curl -X POST https://your-domain.com/api/discord/notify \
     -H "Content-Type: application/json" \
     -d '{
       "type": "new_review",
       "data": {
         "id": "test-123",
         "equipment_name": "Test Equipment",
         "overall_rating": 8,
         "reviewer_name": "Test User"
       }
     }'
   ```

5. **Button Interactions**

   ```
   ✅ Click "Approve" button on notification
   ✅ Click "Reject" button on notification
   ✅ Verify proper response messages
   ```

6. **Role Restrictions**
   ```
   ✅ Test command with authorized user
   ✅ Test command with unauthorized user
   ✅ Verify appropriate permission messages
   ```

### 9.2 Integration Tests

Run the automated test suite:

```bash
# Test Discord integration
npm run test:discord

# Full check including Discord
npm run check:discord
```

## Step 10: Troubleshooting

### 10.1 Bot Not Responding

**Symptoms**: Bot doesn't respond to any commands

**Solutions**:

- ✅ Verify bot is online in Discord server
- ✅ Check bot has all required permissions
- ✅ Confirm interaction endpoint URL is correct and accessible
- ✅ Review Discord Developer Portal application logs
- ✅ Test endpoint directly with curl

### 10.2 Slash Commands Not Appearing

**Symptoms**: Commands don't show up when typing "/"

**Solutions**:

- ✅ Ensure commands are registered (run registration script)
- ✅ Wait up to 1 hour for global commands to propagate
- ✅ Use guild-specific commands for immediate testing
- ✅ Verify bot has "Use Slash Commands" permission

### 10.3 Prefix Commands Not Working

**Symptoms**: `!equipment` commands don't work

**Solutions**:

- ✅ Verify Message Content Intent is enabled
- ✅ Check bot has "Read Message History" permission
- ✅ Ensure user has required roles
- ✅ Test with a simple message to verify bot can read content

### 10.4 Webhook Notifications Failing

**Symptoms**: No notifications appear in Discord channel

**Solutions**:

- ✅ Verify webhook URL is correct and channel exists
- ✅ Test webhook URL directly with curl
- ✅ Check webhook has "Send Messages" permission in the channel
- ✅ Review application logs for webhook errors

### 10.5 Button Interactions Not Working

**Symptoms**: Clicking buttons doesn't trigger responses

**Solutions**:

- ✅ Verify interaction endpoint is properly configured
- ✅ Check that button custom IDs match expected format
- ✅ Ensure user has moderation permissions
- ✅ Review server logs for interaction processing errors

### 10.6 Permission Errors

**Symptoms**: "You do not have permission" messages

**Solutions**:

- ✅ Verify user has correct Discord roles
- ✅ Check DISCORD_ALLOWED_ROLES configuration
- ✅ Ensure role IDs are correct (not role names)
- ✅ Test with a user who definitely has the required role

## Step 11: Production Checklist

### 11.1 Pre-Launch Verification

- [ ] All environment variables configured
- [ ] Bot invited to production Discord server
- [ ] Slash commands registered and visible
- [ ] Webhook notifications working
- [ ] Role restrictions properly configured
- [ ] Interaction endpoint responding correctly
- [ ] Test suite passing (`npm run test:discord`)

### 11.2 Post-Launch Monitoring

- [ ] Monitor Discord Developer Portal for any application warnings
- [ ] Check application logs for Discord-related errors
- [ ] Verify webhook delivery success rates
- [ ] Monitor user feedback on command functionality
- [ ] Track moderation workflow effectiveness

## Step 12: Maintenance & Updates

### 12.1 Regular Tasks

- **Monthly**: Review Discord Developer Portal for any policy updates
- **Quarterly**: Audit role permissions and update as needed
- **As Needed**: Update slash command descriptions if functionality changes

### 12.2 Scaling Considerations

- **Rate Limits**: Monitor Discord API rate limits as usage grows
- **Command Updates**: Use versioning strategy for command modifications
- **Multi-Server**: Consider per-guild configuration for multiple servers

---

## Quick Reference

### Essential URLs

- **Discord Developer Portal**: https://discord.com/developers/applications
- **Discord API Documentation**: https://discord.com/developers/docs
- **Bot Permissions Calculator**: https://discordapi.com/permissions.html

### Key Environment Variables

```env
DISCORD_PUBLIC_KEY=your_application_public_key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook
DISCORD_ALLOWED_ROLES=role_id_1,role_id_2
SITE_URL=https://your-domain.com
```

### Test Commands

```bash
npm run test:discord      # Discord-specific tests
npm run check:discord     # Full check with Discord tests
```

### Support

- Review `docs/DISCORD-INTEGRATION.md` for technical implementation details
- Check `src/test/DISCORD_TEST_SUMMARY.md` for test coverage information
- Reference Discord API documentation for advanced configuration options

---

**🎉 Congratulations!** Once you complete these steps, your Discord bot will be fully functional and integrated with the TT Reviews platform. The community will be able to search for equipment and players, and moderators can efficiently manage review approvals directly from Discord.

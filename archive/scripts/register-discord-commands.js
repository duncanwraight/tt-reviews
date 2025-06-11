// scripts/register-discord-commands.js
/* eslint-env node */
/* eslint-disable no-console */
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error(
    '❌ Missing required environment variables: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN'
  )
  process.exit(1)
}

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

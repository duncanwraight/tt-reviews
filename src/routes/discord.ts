import { Hono } from 'hono'
import { discordController } from '../controllers/discord.controller'
import { Variables } from '../middleware/auth'

export const discord = new Hono<{ Variables: Variables }>()

// Discord webhook endpoint for interactions (slash commands, buttons, etc.)
discord.post('/interactions', discordController.handleInteractions)

// Discord webhook endpoint for message events (prefix commands)
discord.post('/messages', discordController.handleMessages)

// Webhook endpoint for sending notifications to Discord
discord.post('/notify', discordController.sendNotification)

import { Hono } from 'hono'
import { PlayersController } from '../controllers/players.controller'

const players = new Hono()

// Player CRUD operations
players.get('/:slug', PlayersController.getPlayer)
players.post('/submit', PlayersController.submitPlayer)
players.post('/update', PlayersController.updatePlayer)

// Equipment setup operations
players.post('/:slug/equipment', PlayersController.addEquipmentSetup)

export { players }

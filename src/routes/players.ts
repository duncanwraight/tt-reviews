import { Hono } from 'hono'
import { PlayersController } from '../controllers/players.controller'

const players = new Hono()

players.get('/:slug', PlayersController.getPlayer)

export { players }

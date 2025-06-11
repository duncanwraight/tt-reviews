import { Hono } from 'hono';
import { PlayersController } from '../controllers/players.controller';
import { enhancedAuth } from '../middleware/auth-enhanced';
const players = new Hono();
// Player CRUD operations
players.get('/:slug', PlayersController.getPlayer);
players.post('/submit', enhancedAuth, PlayersController.submitPlayer);
players.post('/update', enhancedAuth, PlayersController.updatePlayer);
// Equipment setup operations
players.post('/:slug/equipment', enhancedAuth, PlayersController.addEquipmentSetup);
// Player editing operations
players.post('/:slug/edit', enhancedAuth, PlayersController.editPlayerInfo);
export { players };

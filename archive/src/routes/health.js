import { Hono } from 'hono';
import { HealthController } from '../controllers/health.controller';
const health = new Hono();
health.get('/health', HealthController.healthCheck);
health.get('/hello', HealthController.hello);
export { health };

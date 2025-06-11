import { Hono } from 'hono';
import { EquipmentController } from '../controllers/equipment.controller.js';
import { EnhancedAuthVariables } from '../middleware/auth-enhanced';
type EquipmentVariables = EnhancedAuthVariables & {
    equipmentController: EquipmentController;
};
declare const equipment: Hono<{
    Variables: EquipmentVariables;
}, import("hono/types").BlankSchema, "/">;
export { equipment };
//# sourceMappingURL=equipment.d.ts.map
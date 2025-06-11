import { FC } from 'hono/jsx';
import { Equipment, EquipmentReview } from '../../types/database.js';
interface ReviewSectionProps {
    equipment: Equipment;
    reviews: EquipmentReview[];
    userReview?: EquipmentReview | null;
}
export declare const ReviewSection: FC<ReviewSectionProps>;
export {};
//# sourceMappingURL=ReviewSection.d.ts.map
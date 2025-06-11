import { FC } from 'hono/jsx';
import { Equipment } from '../../types/database.js';
interface ReviewFormProps {
    equipment: Equipment;
    isEditing?: boolean;
    existingReview?: ReviewFormData;
}
interface ReviewFormData {
    id?: string;
    overall_rating: number;
    category_ratings: Record<string, number>;
    review_text: string;
    reviewer_context: {
        playing_level?: string;
        style_of_play?: string;
        testing_duration?: string;
        testing_quantity?: string;
        testing_type?: string;
        other_equipment?: string;
        purchase_location?: string;
        purchase_price?: string;
    };
}
export declare const ReviewForm: FC<ReviewFormProps>;
export {};
//# sourceMappingURL=ReviewForm.d.ts.map
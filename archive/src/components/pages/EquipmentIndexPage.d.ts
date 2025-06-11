import { Equipment, EquipmentReview } from '../../types/database';
interface EquipmentIndexPageProps {
    recentEquipment: Equipment[];
    recentReviews: EquipmentReview[];
    categories: {
        category: string;
        count: number;
    }[];
}
export declare function EquipmentIndexPage({ recentEquipment, recentReviews, categories, }: EquipmentIndexPageProps): import("hono/jsx/jsx-dev-runtime").JSX.Element;
export {};
//# sourceMappingURL=EquipmentIndexPage.d.ts.map
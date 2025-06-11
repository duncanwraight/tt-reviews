import type { FC } from 'hono/jsx';
interface AdminPageProps {
    stats: {
        pending: number;
        approved: number;
        rejected: number;
        total: number;
        playerEditsPending: number;
        playerEditsApproved: number;
        playerEditsRejected: number;
        playerEditsTotal: number;
        equipmentSubmissionsPending: number;
        equipmentSubmissionsApproved: number;
        equipmentSubmissionsRejected: number;
        equipmentSubmissionsTotal: number;
    };
}
export declare const AdminPage: FC<AdminPageProps>;
export {};
//# sourceMappingURL=AdminPage.d.ts.map
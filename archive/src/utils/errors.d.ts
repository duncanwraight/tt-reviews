export declare class AppError extends Error {
    message: string;
    status: number;
    code?: string | undefined;
    constructor(message: string, status?: number, code?: string | undefined);
}
export declare class ValidationError extends AppError {
    constructor(message: string);
}
export declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map
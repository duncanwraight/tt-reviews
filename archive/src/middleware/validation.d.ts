import { Context, Next } from 'hono';
export declare function validateJson<T>(schema: (data: unknown) => T): (c: Context, next: Next) => Promise<void>;
export declare function validateQuery<T>(schema: (data: unknown) => T): (c: Context, next: Next) => Promise<void>;
//# sourceMappingURL=validation.d.ts.map
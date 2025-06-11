import { ValidationError } from '../utils/errors';
export function validateJson(schema) {
    return async (c, next) => {
        try {
            const body = await c.req.json();
            c.set('validatedBody', schema(body));
            await next();
        }
        catch (error) {
            if (error instanceof Error) {
                throw new ValidationError(`Invalid request body: ${error.message}`);
            }
            throw new ValidationError('Invalid request body');
        }
    };
}
export function validateQuery(schema) {
    return async (c, next) => {
        try {
            const query = Object.fromEntries(Object.entries(c.req.queries()).map(([key, values]) => [key, values[0]]));
            c.set('validatedQuery', schema(query));
            await next();
        }
        catch (error) {
            if (error instanceof Error) {
                throw new ValidationError(`Invalid query parameters: ${error.message}`);
            }
            throw new ValidationError('Invalid query parameters');
        }
    };
}

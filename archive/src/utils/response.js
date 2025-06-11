export function successResponse(c, data, status = 200) {
    c.status(status);
    return c.json(data);
}
export function createResponse(c, data, status = 200) {
    c.status(status);
    return c.json(data);
}
export function errorResponse(c, message, status = 500, code) {
    c.status(status);
    return c.json({
        error: message,
        code,
        timestamp: new Date().toISOString(),
    });
}
export function createErrorResponse(c, message, status = 500, code) {
    c.status(status);
    return c.json({
        error: message,
        code,
        timestamp: new Date().toISOString(),
    });
}

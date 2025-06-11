export async function requestLogger(c, next) {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const userAgent = c.req.header('User-Agent') || 'Unknown';
    console.log(`[${new Date().toISOString()}] ${method} ${path} - START`);
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    console.log(`[${new Date().toISOString()}] ${method} ${path} - ${status} (${duration}ms) - ${userAgent}`);
}

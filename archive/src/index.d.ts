declare const app: import("hono").Hono<{
    Variables: import("./middleware/auth-enhanced").EnhancedAuthVariables;
}, import("hono/types").BlankSchema, "/">;
export default app;
//# sourceMappingURL=index.d.ts.map
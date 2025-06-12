import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/equipment", "routes/equipment.tsx"),
  route("/equipment/:slug", "routes/equipment.$slug.tsx"),
  route("/players", "routes/players.tsx"),
  route("/players/:slug", "routes/players.$slug.tsx"),
  route("/search", "routes/search.tsx"),
  route("/test-api", "routes/test-api.tsx"),
  route("/test-db", "routes/test-db.tsx"),
  route("/debug-auth", "routes/debug-auth.tsx"),
  route("/login", "routes/login.tsx"),
  route("/logout", "routes/logout.tsx"),
  route("/profile", "routes/profile.tsx"),
] satisfies RouteConfig;

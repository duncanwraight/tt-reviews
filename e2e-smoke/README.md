# Smoke suite

Read-only Playwright specs that run against a deployed URL (preview or prod).

Unlike `e2e/`, these specs:

- **Never mutate data.** Preview and prod share the same Supabase + R2 bindings
  (Cloudflare Workers versions don't fork bindings), so writes from a smoke run
  would hit the real prod database. Assert on shape, not specific data.
- **Don't boot a local dev server.** The config requires
  `PLAYWRIGHT_SMOKE_BASE_URL` to point at an already-live URL.
- **Are fast.** Target the whole suite to finish in ~20s so it's cheap to run
  both pre- and post-promote in the CI pipeline.

## Running locally

```sh
PLAYWRIGHT_SMOKE_BASE_URL=https://tabletennis.reviews npm run test:smoke
```

## When to add a new smoke test

Add one only if a break would be a user-visible prod outage that the full
`e2e/` suite would miss because it only runs pre-deploy. If the check is
write-path or needs auth, it belongs in `e2e/`, not here.

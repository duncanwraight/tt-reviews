# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`
- **Coding standards and best practices** can be found in `./docs/CODING-STANDARDS.md` - follow these for all code
- UI/UX design guidelines and style principles can be found in `./docs/STYLE-GUIDE.md`
- Layout guide can be found in `./docs/LAYOUT.md`
- Make sure that SEO strategy and optimization guidelines (found in `./docs/SEO.md`) are constantly referenced when designing every relevant part of the application

## Interactions with my device

- All references to localhost should be replaced with "tt-reviews.local" which is set up to point at 127.0.0.1 in my `/etc/hosts` file
  - This is especially applicable when working locally with Supabase as in the past `localhost` has ended with silent ipv6 failures

## Asking about tasks

### Non-destructive tasks (no permission needed):

- File operations: ls, read, grep, find, cat, rg
- Git operations: add, push, status, diff, log
- Package managers: npm install, npm run (build/test/lint/test:discord)
- Database reads: SELECT queries
- When running docker exec commands for data retrieval - e.g. database SELECTs or the aforementioned commands executed within a container
- I will run supabase commands for you - apart from supabase migrations up, you can run that one without permission

### Tasks that don't require permission:

- Updating markdown files (\*.md) in the docs/ directory or project root
- Running `git add` or `git push` commands

### Destructive tasks (ask first):

- File modifications to code files: edit, write, delete
- Git commits
- Database writes: INSERT, UPDATE, DELETE
- System configuration changes

## TODOs

- Every new change we work on should be stored in `./docs/TODO.md`
- You should read this file every time we start a new conversation

## Workflow

When you have completed a change, or a small batch of changes, always follow this process:

- **CRITICAL**: Run `npm run format` first, then `npm run check` (formats, lints, and type checks) and ensure it passes with zero errors
- **Discord Changes**: For Discord-related changes, also run `npm run test:discord` to verify integration
- **DO NOT COMMIT** if `npm run check` fails with any TypeScript errors or linting errors
- **Database Changes**: Use `supabase migrations up` to apply migrations locally, but migrations will be deployed to the production database through the Github Actions pipeline which occurs once we've pushed to `main`
- Await my input to confirm the change has been tested
- Update the ./docs/TODO.md file to mark changes completed
- Stage all files in the repo with `git add .`
- Commit and push

### Pre-Commit Requirements

NEVER commit code that fails type checking or has build errors. Always ensure:

1. `npm run check` passes completely (zero errors)
2. All TypeScript errors are resolved
3. No critical linting errors remain (warnings are acceptable)

## Code Quality Standards

When writing TypeScript code, follow these strict guidelines to avoid linting errors:

- **Avoid inline styles**: In any JavaScript or TypeScript file we create, avoid inline styles. Put them in stylesheets instead
- **No `any` types**: Always use proper TypeScript types. Import `SupabaseClient` type instead of using `any`
- **No unused variables**: Remove or prefix with underscore if intentionally unused
- **Proper type assertions**: Use `as Record<string, string>` for environment variables instead of accessing unknown types directly
- **Import specific types**: Import `{ createClient, SupabaseClient }` instead of just the client

## Important Notes

- Don't try to run Bash(npm run dev) commands, I will do those - just ask me to do it and await my feedback
- Always remember RLS policies for our Supabase databases (local and prod)
- Don't run `supabase db reset` without EXPRESSLY ASKING TO DO SO in CAPITAL LETTERS
- To run database queries, use `docker exec` on the relevant Supabase database container

# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`
- **Coding standards and best practices** can be found in `./docs/CODING-STANDARDS.md` - follow these for all code
- UI/UX design guidelines and style principles can be found in `./docs/STYLE-GUIDE.md`
- Layout guide can be found in `./docs/LAYOUT.md`
- Make sure that SEO strategy and optimization guidelines (found in `./docs/SEO.md`) are constantly referenced when designing every relevant part of the application
- Don't ever disable linting in files

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

- **CRITICAL**: Run `npm run check` (formats, lints, and type checks) and ensure it passes with zero errors
- **Discord Changes**: For Discord-related changes, also run `npm run test:discord` to verify integration
- **DO NOT COMMIT** if `npm run check` fails with any TypeScript errors or linting errors
- **Database Changes**: If you created new migrations, run `./scripts/deploy-migrations.sh` after deployment
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

- **No `any` types**: Always use proper TypeScript types. Import `SupabaseClient` type instead of using `any`
- **No unused variables**: Remove or prefix with underscore if intentionally unused
- **Proper type assertions**: Use `as Record<string, string>` for environment variables instead of accessing unknown types directly
- **Import specific types**: Import `{ createClient, SupabaseClient }` instead of just the client

Example of correct typing:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export class EquipmentService {
  constructor(private supabase: SupabaseClient) {}
}

// For environment variables
const envTyped = env as Record<string, string>
```

## Testing

- **Discord Integration**: Complete test suite available via `npm run test:discord`
- **All Tests**: Run `npm test` for full test coverage including Discord functionality
- **Test Location**: Discord tests are in `src/test/discord-simple.test.ts` and `src/controllers/discord.controller.test.ts`
- **Test Summary**: See `src/test/DISCORD_TEST_SUMMARY.md` for comprehensive Discord test coverage details

## Discord Integration

- **Endpoints**: `/api/discord/interactions`, `/api/discord/messages`, `/api/discord/notify`
- **Commands**: Slash commands (`/equipment`, `/player`) and prefix commands (`!equipment`, `!player`)
- **Moderation**: Two-review approval system with Discord button interactions
- **Testing**: Use `npm run test:discord` to verify Discord functionality without requiring live Discord API

## Important Notes

- Don't try to run Bash(npm run dev) commands, I will do those - just ask me to do it and await my feedback

## Code Commit Best Practices

- Always run code quality checks, tests etc, the full works BEFORE trying to commit. We use pre-commit hooks, and ideally we want all code to pass those without having to fix again before committing
- Don't ever disable linting in files

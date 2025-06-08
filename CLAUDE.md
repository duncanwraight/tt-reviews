# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`
- UI/UX design guidelines and style principles can be found in `./docs/STYLE-GUIDE.md`

## Asking about tasks

### Non-destructive tasks (no permission needed):
- File operations: ls, read, grep, find, cat, rg
- Git operations: add, push, status, diff, log
- Package managers: npm install, npm run (build/test/lint)
- Database reads: SELECT queries
- When running docker exec commands for data retrieval - e.g. database SELECTs or the aforementioned commands executed within a container

### Tasks that don't require permission:
- Updating markdown files (*.md) in the docs/ directory or project root
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
- Run formatter and linter commands
- Await my input to confirm the change has been tested
- Update the ./docs/TODO.md file to mark changes completed
- Stage all files in the repo with `git add .`
- Commit and push

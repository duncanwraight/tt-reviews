# Instructions for Claude

- To find general information about table tennis, and the terminology used by its competitive players across the globe, read `./docs/GLOSSARY.md`
- Application requirements can be found in all of the markdown files in `./docs/reqs`
- Tech stack and architecture decisions can be found in `./docs/DECISIONS.md`

## Asking about tasks
- You don't need to ask for permission to run non-destructive tasks, such as
  - List
  - Read
  - rg, grep, find, cat
- When running docker exec commands, don't ask for permission if you're just retrieving data - e.g. database SELECTs or the aforementioned commands executed within a container
- You don't need to ask for permission to run `git add` or `git push` commands, but do ask when committing

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

# Opportunistic refactors

Code health work that isn't gated and isn't urgent. The general rule is "only split the slice you're already editing" — proactive splits risk merge conflicts against in-flight work. Promote an item from a one-paragraph note to a detailed plan (see `docs/archive/REFACTOR-DISCORD.md` or `docs/archive/REFACTOR-DATABASE.md` for shipped examples) when you're actually going to do the work.

---

# General guidance

- **Only split the slice you're already editing.** A partial split is fine — the remaining surface can wait until its next touch.
- **Re-export from the original file** (`export * from "./database/equipment"`) so callers don't all need updating in the same commit.
- **Land the split and the feature change in the same commit** unless the split alone is substantial.

## Why bother

- **Testing** — smaller modules are directly testable without heavy mocking.
- **Navigation** — 2k+ line files dwarf the editor.
- **Mock surface** — `vi.mock("~/lib/database/equipment")` is far narrower than mocking the whole service.

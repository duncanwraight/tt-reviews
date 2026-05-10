import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS } from "../slash-commands";

/**
 * Regression guard for the registration script's command list. Asserting
 * exactly two commands here is what stops `/approve` and `/reject` from
 * sneaking back in (they were dropped by TT-159 and a re-add would
 * silently re-register them on the next dev/prod script run).
 */
describe("SLASH_COMMANDS — registration source of truth", () => {
  it("contains exactly the two TT-156 commands", () => {
    const names = SLASH_COMMANDS.map(c => c.name).sort();
    expect(names).toEqual(["equipment", "player"]);
  });

  it("declares each command as CHAT_INPUT (type 1) with a description", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.type).toBe(1);
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it("declares a single required `query` STRING option per command", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.options).toHaveLength(1);
      const opt = cmd.options[0];
      expect(opt.name).toBe("query");
      expect(opt.type).toBe(3); // 3 = STRING
      expect(opt.required).toBe(true);
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });

  it("uses lowercase command names within Discord's 32-char limit", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.name).toBe(cmd.name.toLowerCase());
      expect(cmd.name.length).toBeLessThanOrEqual(32);
      // Discord requires names match ^[-_\p{L}\p{N}]{1,32}$. Stay
      // pragmatic — ASCII lowercase letters only is the simplest
      // check and matches what we ship today.
      expect(cmd.name).toMatch(/^[a-z][a-z0-9_-]*$/);
    }
  });
});

import { expect, test } from "@playwright/test";
import {
  buildSlashCommandInteraction,
  signDiscordRequest,
} from "./utils/discord";

// TT-161: e2e for the /equipment and /player slash-command rebuild.
//
// What this asserts: the immediate ack the dev server returns to a
// signed Discord interaction. Search work + embed rendering + followup
// PATCH all happen via ctx.waitUntil after the type-5 ack returns, so
// the body that lands in Discord can't be observed from Playwright
// directly without live Discord credentials. Instead we drive each of
// the four code paths (single match, ambiguity, zero-match, removed
// command) and assert the immediate response shape — that's the signal
// that catches signature-verification mismatches, dispatch routing
// regressions, and the synchronous-validation rejections (empty query,
// unknown command name, malformed interaction).
//
// Visual QA on at least one desktop client and one mobile client of a
// real /equipment and /player invocation in the dev guild remains a
// manual sign-off requirement (parent TT-156 § "Embed rendering differs
// across clients" — captured as PR screenshots).
//
// Test-design notes:
//   - Distinct userId (`9999991616`) so the SELECT-then-INSERT race
//     in get_or_create_discord_moderator can't conflict with
//     discord-moderation.spec.ts's user record.
//   - The deferred-ack assertions are bundled into one Playwright test
//     so the burst of slash-command POSTs lands serially within one
//     worker, giving the DISCORD_WEBHOOK rate limiter (20 req / 10s
//     shared across discord-* specs) more headroom when CI runs with
//     workers=2.
//   - Retry on 429 inside postInteraction so transient throttling
//     under high-parallel CI doesn't flake a green deploy.

const SEARCH_USER_ID = "9999991616";

async function postInteraction(
  request: import("@playwright/test").APIRequestContext,
  interaction: object
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = JSON.stringify(interaction);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const { signature } = signDiscordRequest(timestamp, body);
    const response = await request.post("/api/discord/interactions", {
      headers: {
        "Content-Type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      data: body,
    });
    if (response.status() !== 429) return response;
    await new Promise(resolve => setTimeout(resolve, 5_000 * (attempt + 1)));
  }
  // Surface the final 429 for a clear failure if the budget never
  // recovers.
  const body = JSON.stringify(interaction);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const { signature } = signDiscordRequest(timestamp, body);
  return request.post("/api/discord/interactions", {
    headers: {
      "Content-Type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    data: body,
  });
}

test("Discord slash commands defer (type 5) for the four search paths", async ({
  request,
}) => {
  const cases: { command: "equipment" | "player"; query: string }[] = [
    { command: "equipment", query: "viscaria" }, // single match
    { command: "equipment", query: "butterfly" }, // ambiguity
    { command: "equipment", query: "ksdjfh-no-such-thing-xyz" }, // zero-match
    { command: "player", query: "ma long" }, // /player single match
  ];

  for (const { command, query } of cases) {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({ userId: SEARCH_USER_ID, command, query })
    );
    expect(response.status(), `${command} ${query}`).toBe(200);
    const json = (await response.json()) as { type: number };
    expect(json.type, `${command} ${query}`).toBe(5);
  }
});

test("Discord slash command — empty query returns ephemeral error (type 4 with flags=64)", async ({
  request,
}) => {
  const response = await postInteraction(
    request,
    buildSlashCommandInteraction({
      userId: SEARCH_USER_ID,
      command: "equipment",
      query: "   ",
    })
  );
  expect(response.status()).toBe(200);
  const json = (await response.json()) as {
    type: number;
    data?: { content?: string; flags?: number };
  };
  expect(json.type).toBe(4);
  expect(json.data?.flags).toBe(64);
  expect(json.data?.content).toContain("Please provide a search query");
});

test("Discord slash commands — /approve and /reject return 'Unknown command' (TT-159 removal regression)", async ({
  request,
}) => {
  // Regression guard: TT-159 dropped /approve and /reject. Re-adding
  // either would re-introduce the redundant-with-buttons mod surface,
  // so the dispatch should respond "Unknown command" until the
  // registration script is re-run with the command added back.
  for (const command of ["approve", "reject"] as const) {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({
        userId: SEARCH_USER_ID,
        command,
        query: "any-id",
      })
    );
    expect(response.status(), command).toBe(200);
    const json = (await response.json()) as {
      type: number;
      data?: { content?: string; flags?: number };
    };
    expect(json.type, command).toBe(4);
    expect(json.data?.flags, command).toBe(64);
    expect(json.data?.content, command).toContain("Unknown command");
  }
});

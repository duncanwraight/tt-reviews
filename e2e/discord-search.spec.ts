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

async function postInteraction(
  request: import("@playwright/test").APIRequestContext,
  interaction: object
) {
  // Retry on 429 — DISCORD_WEBHOOK rate limit is 20 req / 10s shared
  // across all discord-* e2e specs. When the suite runs with multiple
  // workers, bursts can transiently exceed the budget. The 429 path is
  // benign (the dev server is healthy, just throttled), so back off and
  // retry rather than failing a green deploy on noise.
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
  // Surface the final 429 if the rate limit doesn't clear — should be
  // rare enough that the assertion fails loudly with a clear cause.
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

test.describe("Discord /equipment slash command", () => {
  test("single match — defers (type 5)", async ({ request }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({
        command: "equipment",
        query: "viscaria",
      })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as { type: number };
    expect(json.type).toBe(5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });

  test("ambiguous query — defers (type 5)", async ({ request }) => {
    // 'butterfly' has many matches in seed; the dispatch defers and the
    // followup PATCH carries the ambiguity hint. Both single and
    // ambiguous outcomes share the type-5 ack — the differentiator is
    // the followup body, which lives outside this assertion's reach.
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({
        command: "equipment",
        query: "butterfly",
      })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as { type: number };
    expect(json.type).toBe(5);
  });

  test("zero-match query — defers (type 5)", async ({ request }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({
        command: "equipment",
        query: "ksdjfh-no-such-thing-xyz",
      })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as { type: number };
    expect(json.type).toBe(5);
  });

  test("empty query — synchronous ephemeral error (type 4 with flags=64)", async ({
    request,
  }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({ command: "equipment", query: "   " })
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
});

test.describe("Discord /player slash command", () => {
  test("single match — defers (type 5)", async ({ request }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({ command: "player", query: "ma long" })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as { type: number };
    expect(json.type).toBe(5);
  });
});

test.describe("Discord — removed slash commands fail loudly", () => {
  // Regression guard: TT-159 dropped /approve and /reject. Re-adding
  // either would re-introduce the redundant-with-buttons mod surface,
  // so the dispatch should respond "Unknown command" until the
  // registration script is re-run with the command added back. Keeping
  // these tests here means the mistake fires the next time CI runs.

  test("/approve returns ephemeral 'Unknown command'", async ({ request }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({ command: "approve", query: "any-id" })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as {
      type: number;
      data?: { content?: string; flags?: number };
    };
    expect(json.type).toBe(4);
    expect(json.data?.flags).toBe(64);
    expect(json.data?.content).toContain("Unknown command");
  });

  test("/reject returns ephemeral 'Unknown command'", async ({ request }) => {
    const response = await postInteraction(
      request,
      buildSlashCommandInteraction({ command: "reject", query: "any-id" })
    );
    expect(response.status()).toBe(200);
    const json = (await response.json()) as {
      type: number;
      data?: { content?: string; flags?: number };
    };
    expect(json.type).toBe(4);
    expect(json.data?.content).toContain("Unknown command");
  });
});

// TT-160: register the /equipment and /player slash commands with Discord.
//
// Single source of truth for what commands exist is
// `app/lib/discord/slash-commands.ts`. This script PUTs that array to
// the guild-scoped commands endpoint, which is idempotent — re-running
// reconciles whatever's currently registered (so removing a command
// from the array deletes it from Discord on the next run, and there's
// no manual "delete by ID" step).
//
// Usage:
//
//   # Dev guild — values auto-loaded from .dev.vars:
//   node --experimental-strip-types scripts/register-discord-commands.ts --env dev
//
//   # Prod (real bot, real guild) — explicit values + confirm flag:
//   DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... DISCORD_GUILD_ID=... \
//     node --experimental-strip-types scripts/register-discord-commands.ts --env prod --confirm prod
//
// Why guild-scoped: guild commands propagate instantly (vs ~1 hour for
// global). And the dev/prod isolation we already use (separate Discord
// applications, separate guilds) means a stray prod registration can't
// land in dev or vice versa even with the wrong token.
//
// Why .dev.vars is only auto-loaded for --env dev: in prod we want the
// operator to pass values explicitly so a stray .dev.vars on disk
// can't ever leak into a prod registration call.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  SLASH_COMMANDS,
  type SlashCommandDefinition,
} from "../app/lib/discord/slash-commands.ts";

interface ParsedArgs {
  env: "dev" | "prod";
  confirmProd: boolean;
}

function showHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    `register-discord-commands.ts — TT-160

Usage:
  node --experimental-strip-types scripts/register-discord-commands.ts \\
    --env <dev|prod> [--confirm prod]

Env (auto-loaded from .dev.vars in --env dev; pass explicitly for --env prod):
  DISCORD_BOT_TOKEN  bot token for the target application
  DISCORD_APP_ID     application ID for the target Discord app
  DISCORD_GUILD_ID   guild ID where commands should be registered

Flags:
  --env dev|prod     required — chooses which credentials to expect
  --confirm prod     required when --env prod (guard against accidents)
  --help             show this message

Idempotent: re-runs replace whatever's currently registered. Removing a
command from app/lib/discord/slash-commands.ts deletes it on next run.
`
  );
}

function parseCliArgs(argv: string[]): ParsedArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      env: { type: "string" },
      confirm: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const env = values.env;
  if (env !== "dev" && env !== "prod") {
    fail(`--env must be 'dev' or 'prod' (got ${JSON.stringify(env)})`);
  }

  const confirmProd = values.confirm === "prod";
  if (env === "prod" && !confirmProd) {
    fail(
      "--env prod requires --confirm prod. Refusing to write to a prod " +
        "Discord application without explicit acknowledgement."
    );
  }

  return { env, confirmProd };
}

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`✗ ${message}`);
  process.exit(1);
}

// In dev, populate process.env from .dev.vars on the way in so the
// operator can run the script without sourcing the file themselves.
// Existing values in process.env take precedence so an explicit
// override on the command line still wins. Mirrors the loader pattern
// in scripts/photo-sourcing/test-resolver.ts.
function loadDevVarsIfPresent(): void {
  const path = resolve(process.cwd(), ".dev.vars");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readEnvOrFail(name: string, env: "dev" | "prod"): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    fail(
      env === "dev"
        ? `${name} is not set. Add it to .dev.vars or export it before running.`
        : `${name} is not set. Pass it explicitly when running --env prod.`
    );
  }
  return value;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function registerCommands(
  appId: string,
  guildId: string,
  botToken: string,
  commands: readonly SlashCommandDefinition[]
): Promise<void> {
  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const text = await response.text();
    fail(
      `Discord rejected PUT (status ${response.status}). Body: ${text.slice(0, 800)}`
    );
  }

  const registered = (await response.json()) as Array<{
    id: string;
    name: string;
    description: string;
  }>;

  // eslint-disable-next-line no-console
  console.log(`\n✓ Registered ${registered.length} command(s):`);
  for (const cmd of registered) {
    // eslint-disable-next-line no-console
    console.log(`  - /${cmd.name} (id=${cmd.id}): ${cmd.description}`);
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.env === "dev") {
    loadDevVarsIfPresent();
  }

  const botToken = readEnvOrFail("DISCORD_BOT_TOKEN", args.env);
  const appId = readEnvOrFail("DISCORD_APP_ID", args.env);
  const guildId = readEnvOrFail("DISCORD_GUILD_ID", args.env);

  // eslint-disable-next-line no-console
  console.log(
    `About to register ${SLASH_COMMANDS.length} command(s) to app \`${appId}\` ` +
      `in guild \`${guildId}\` (env=\`${args.env}\`).`
  );
  // eslint-disable-next-line no-console
  console.log(`Commands: ${SLASH_COMMANDS.map(c => "/" + c.name).join(", ")}`);
  // eslint-disable-next-line no-console
  console.log("Continuing in 2s — Ctrl-C now to abort.\n");
  await sleep(2_000);

  await registerCommands(appId, guildId, botToken, SLASH_COMMANDS);
}

main().catch(err => {
  fail(err instanceof Error ? err.message : String(err));
});

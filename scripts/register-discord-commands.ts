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
//   # Dev guild — uses the runtime's DISCORD_* values from .dev.vars:
//   node --experimental-strip-types scripts/register-discord-commands.ts --env dev
//
//   # Prod guild — uses the script-only PROD_DISCORD_* values:
//   node --experimental-strip-types scripts/register-discord-commands.ts --env prod --confirm prod
//
// Why prefixed prod vars: the runtime Worker reads DISCORD_BOT_TOKEN /
// DISCORD_APP_ID / DISCORD_GUILD_ID from `.dev.vars` and those point at
// the dev application + dev guild, deliberately. Holding the prod app
// credentials under PROD_DISCORD_* means (a) the script can pick the
// right set per --env without juggling shell exports, and (b) a stray
// runtime read can never pull prod values — they're invisible to
// DiscordContext.env.
//
// Both modes auto-load `.dev.vars` so the file (gitignored) can be the
// single source of truth for both runtime and script credentials.
//
// Why guild-scoped registration: guild commands propagate instantly (vs
// ~1 hour for global), and the dev/prod isolation (separate Discord
// applications, separate guilds) means a stray dev registration can't
// land in prod or vice versa.

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

Env (auto-loaded from .dev.vars; mirrors runtime conventions):
  --env dev   reads:  DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID
              (same values the Worker reads when running 'wrangler dev')
  --env prod  reads:  PROD_DISCORD_BOT_TOKEN, PROD_DISCORD_APP_ID,
                      PROD_DISCORD_GUILD_ID
              (script-only — these never reach the runtime Worker)

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

function readEnvOrFail(name: string, _env: "dev" | "prod"): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    fail(
      `${name} is not set. Add it to .dev.vars or export it before running.`
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

  // Auto-load .dev.vars for both modes — that file is the single source
  // of truth for both runtime and script credentials. The prefix on
  // PROD_* names is what keeps modes isolated; .dev.vars holding
  // PROD_DISCORD_* values can never leak into the runtime Worker
  // because DiscordContext.env reads the unprefixed names.
  loadDevVarsIfPresent();

  const prefix = args.env === "prod" ? "PROD_" : "";
  const botToken = readEnvOrFail(`${prefix}DISCORD_BOT_TOKEN`, args.env);
  const appId = readEnvOrFail(`${prefix}DISCORD_APP_ID`, args.env);
  const guildId = readEnvOrFail(`${prefix}DISCORD_GUILD_ID`, args.env);

  // Dev commands ship with a `test-` prefix on the registered name so
  // they're visually distinct in the Discord picker for testers, and so
  // a tighter role gate (DISCORD_SEARCH_ALLOWED_ROLES set to the
  // testing-mod role) keeps stray invocations to vetted users only.
  // The dispatch (app/lib/discord/dispatch.ts:handleSlashCommand) strips
  // the prefix in dev so handlers stay environment-agnostic.
  const commandsToRegister: SlashCommandDefinition[] =
    args.env === "dev"
      ? SLASH_COMMANDS.map(c => ({ ...c, name: `test-${c.name}` }))
      : [...SLASH_COMMANDS];

  // eslint-disable-next-line no-console
  console.log(
    `About to register ${commandsToRegister.length} command(s) to app \`${appId}\` ` +
      `in guild \`${guildId}\` (env=\`${args.env}\`).`
  );
  // eslint-disable-next-line no-console
  console.log(
    `Commands: ${commandsToRegister.map(c => "/" + c.name).join(", ")}`
  );
  // eslint-disable-next-line no-console
  console.log("Continuing in 2s — Ctrl-C now to abort.\n");
  await sleep(2_000);

  await registerCommands(appId, guildId, botToken, commandsToRegister);
}

main().catch(err => {
  fail(err instanceof Error ? err.message : String(err));
});

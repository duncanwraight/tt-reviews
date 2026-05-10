// TT-160: single source of truth for the slash commands the bot exposes.
//
// The registration script (scripts/register-discord-commands.ts) reads
// this array and PUTs it to Discord's guild-scoped commands endpoint.
// Adding or removing a command means updating this array — the next
// script run reconciles whatever Discord has on file.
//
// Type matches Discord's `application command option` JSON shape:
// https://discord.com/developers/docs/interactions/application-commands

export interface SlashCommandOption {
  name: string;
  description: string;
  // 3 = STRING per https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type
  type: 3;
  required: boolean;
}

export interface SlashCommandDefinition {
  name: string;
  description: string;
  // 1 = CHAT_INPUT (slash command). Only kind we register today.
  type: 1;
  options: SlashCommandOption[];
}

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  {
    name: "equipment",
    description: "Search the table-tennis equipment catalogue",
    type: 1,
    options: [
      {
        name: "query",
        description: "Equipment name (e.g. 'butterfly viscaria')",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "player",
    description: "Search the table-tennis player profiles",
    type: 1,
    options: [
      {
        name: "query",
        description: "Player name (e.g. 'ma long')",
        type: 3,
        required: true,
      },
    ],
  },
];

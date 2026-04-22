import type { AppLoadContext } from "react-router";
import type { DatabaseService } from "../database.server";
import type { ModerationService } from "../moderation.server";
import type { UnifiedDiscordNotifier } from "./unified-notifier.server";

/**
 * Shared dependencies for Discord submodule functions. Constructed once
 * in DiscordService's constructor and passed as the first arg to every
 * exported function under app/lib/discord/*. Lets tests build a minimal
 * context with mocked services instead of instantiating the whole class.
 */
export interface DiscordContext {
  env: Cloudflare.Env;
  context: AppLoadContext;
  dbService: DatabaseService;
  moderationService: ModerationService;
  unifiedNotifier: UnifiedDiscordNotifier;
}

/**
 * Submission types that flow through the approve/reject Discord message
 * lifecycle — i.e. the ones whose embed + buttons are patched after a
 * moderator action. Reviews and player_equipment_setup are moderated
 * elsewhere and don't participate in the post-moderation message edit.
 */
export type ModeratableSubmissionType =
  | "equipment"
  | "player"
  | "player_edit"
  | "video";

/**
 * Minimal shape of the Discord user passed into moderation handlers.
 */
export interface DiscordUser {
  id: string;
  username: string;
}

/**
 * Discord guild member as it arrives in interactions — we only look at
 * the `roles` array for permission checks.
 */
export interface DiscordMember {
  roles: string[];
}

/**
 * Discord interaction envelope — covers both slash commands (type 2)
 * and message components / buttons (type 3), plus the ping challenge
 * (type 1) that registration sends.
 */
export interface DiscordInteraction {
  type: number;
  data: {
    name: string;
    custom_id?: string;
    options?: Array<{ value: string }>;
  };
  user?: DiscordUser;
  member: DiscordMember & { user?: DiscordUser };
  guild_id: string;
}

/**
 * Legacy prefix-command message shape ("!equipment ...", "!player ...").
 */
export interface DiscordMessage {
  content: string;
  member: DiscordMember;
  guild_id: string;
}

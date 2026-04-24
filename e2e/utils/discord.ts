import * as crypto from "crypto";

// Test-only Ed25519 keypair used to sign Discord-style interaction
// requests. The matching public key is auto-accepted by the dev server
// when ENVIRONMENT=development (see app/lib/discord/messages.ts —
// E2E_TEST_PUBLIC_KEY_HEX) so the keypair "just works" both locally
// and in CI. Do NOT use in production.
const DISCORD_TEST_PRIVATE_KEY_HEX =
  "0e77e13801015d462958195e7ac96cad55b89b296444746eacf91d156470e5ac";

/**
 * Build an Ed25519 PKCS8 DER from a raw 32-byte seed (the format Node
 * createPrivateKey wants). The prefix is the standard ed25519 pkcs8 header
 * followed by an OCTET STRING containing the seed.
 */
function pkcs8FromSeed(seedHex: string): Buffer {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return Buffer.concat([prefix, Buffer.from(seedHex, "hex")]);
}

/**
 * Sign a Discord interaction request body. Discord's scheme is simple:
 * message = timestamp + rawBody, signed Ed25519, hex-encoded.
 */
export function signDiscordRequest(
  timestamp: string,
  body: string
): { signature: string; timestamp: string } {
  const privateKey = crypto.createPrivateKey({
    key: pkcs8FromSeed(DISCORD_TEST_PRIVATE_KEY_HEX),
    format: "der",
    type: "pkcs8",
  });
  const message = Buffer.from(timestamp + body, "utf8");
  const signature = crypto.sign(null, message, privateKey).toString("hex");
  return { signature, timestamp };
}

/**
 * Shape of a Discord MESSAGE_COMPONENT (button-click) interaction that
 * the /api/discord/interactions action routes via custom_id. Member.user
 * mirrors what Discord actually sends when a button is clicked in a guild
 * channel; handleInteraction uses either interaction.user or
 * interaction.member.user.
 */
export function buildButtonInteraction(params: {
  customId: string;
  userId?: string;
  username?: string;
}): object {
  return {
    type: 3, // MESSAGE_COMPONENT
    id: "test-interaction-id",
    application_id: "test-app-id",
    token: "test-interaction-token",
    version: 1,
    data: {
      custom_id: params.customId,
      component_type: 2, // BUTTON
    },
    member: {
      // Must match at least one role from DISCORD_ALLOWED_ROLES or the
      // handler's checkUserPermissions rejects with "You do not have
      // permission to use this command."
      roles: ["role_e2e_moderator"],
      user: {
        id: params.userId ?? "1234567890",
        username: params.username ?? "e2e-discord-mod",
      },
    },
    channel_id: "test-channel-id",
    guild_id: "test-guild-id",
  };
}

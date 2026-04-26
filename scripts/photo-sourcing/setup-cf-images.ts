// One-shot Cloudflare Images bootstrap for TT-48.
//
// Reads .dev.vars, verifies a token can talk to the Images API,
// creates the three variants (`thumbnail`, `card`, `full`) defined by
// app/lib/images/cloudflare.ts, discovers the account-hash by reading
// the variants URL pattern from CF, and writes IMAGES_ACCOUNT_ID /
// IMAGES_ACCOUNT_HASH / IMAGES_API_TOKEN back into .dev.vars so the
// dev server picks them up.
//
// Idempotent — re-running with everything already configured is a
// no-op aside from a confirmation print.
//
// Usage:
//   node --experimental-strip-types scripts/photo-sourcing/setup-cf-images.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV_VARS_PATH = resolve(process.cwd(), ".dev.vars");
const API = "https://api.cloudflare.com/client/v4";

interface VariantSpec {
  id: "thumbnail" | "card" | "full";
  width: number;
  height: number;
}

const VARIANTS: VariantSpec[] = [
  { id: "thumbnail", width: 256, height: 256 },
  { id: "card", width: 512, height: 512 },
  { id: "full", width: 1024, height: 1024 },
];

function parseDevVars(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2];
  }
  return out;
}

function writeDevVars(
  content: string,
  updates: Record<string, string>
): string {
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const out = lines.map(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  return out.join("\n");
}

interface CfResponse<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: T;
}

async function cfFetch<T>(
  path: string,
  init: RequestInit & { token: string }
): Promise<CfResponse<T>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${init.token}`,
    },
  });
  let json: CfResponse<T> = { success: false };
  try {
    json = (await res.json()) as CfResponse<T>;
  } catch {
    json.errors = [{ code: res.status, message: await res.text() }];
  }
  if (!res.ok && !json.errors?.length) {
    json.errors = [{ code: res.status, message: res.statusText }];
  }
  return json;
}

function fmtErrors(r: CfResponse<unknown>): string {
  if (!r.errors?.length) return "unknown error";
  return r.errors.map(e => `${e.code}: ${e.message}`).join("; ");
}

async function probeToken(token: string, accountId: string): Promise<boolean> {
  // List variants — least-privilege Images:Read is enough.
  const r = await cfFetch<{ variants: Record<string, unknown> }>(
    `/accounts/${accountId}/images/v1/variants`,
    { method: "GET", token }
  );
  return r.success;
}

async function listExistingVariants(
  token: string,
  accountId: string
): Promise<Set<string>> {
  const r = await cfFetch<{ variants: Record<string, unknown> }>(
    `/accounts/${accountId}/images/v1/variants`,
    { method: "GET", token }
  );
  if (!r.success || !r.result) return new Set();
  return new Set(Object.keys(r.result.variants));
}

async function createVariant(
  token: string,
  accountId: string,
  v: VariantSpec
): Promise<void> {
  const r = await cfFetch<unknown>(
    `/accounts/${accountId}/images/v1/variants`,
    {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: v.id,
        options: {
          fit: "scale-down",
          width: v.width,
          height: v.height,
          metadata: "none",
        },
      }),
    }
  );
  if (!r.success) {
    throw new Error(`create variant ${v.id} failed: ${fmtErrors(r)}`);
  }
}

interface CfImage {
  id: string;
  variants: string[];
}

async function discoverAccountHash(
  token: string,
  accountId: string
): Promise<string> {
  // Try to read an existing image's variants URL first.
  const list = await cfFetch<{ images: CfImage[] }>(
    `/accounts/${accountId}/images/v1?per_page=1`,
    { method: "GET", token }
  );
  if (list.success && list.result?.images?.length) {
    const url = list.result.images[0].variants?.[0];
    const hash = url?.match(/imagedelivery\.net\/([^/]+)\//)?.[1];
    if (hash) return hash;
  }

  // Empty library — upload a 1×1 PNG to learn the hash, then delete.
  const PNG_1X1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const form = new FormData();
  form.set("file", new Blob([PNG_1X1], { type: "image/png" }), "probe.png");
  const upRes = await fetch(`${API}/accounts/${accountId}/images/v1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upJson = (await upRes.json()) as CfResponse<CfImage>;
  if (!upJson.success || !upJson.result) {
    // 5403 = "account not entitled to this service". The variants
    // endpoints are reachable without an active Images subscription
    // (config-only), but uploads require the paid plan to be enabled.
    const code = upJson.errors?.[0]?.code;
    if (code === 5403) {
      throw new Error(
        "Cloudflare Images is not enabled on this account. Enable the plan at https://dash.cloudflare.com → Images, then re-run. Alternatively, grab IMAGES_ACCOUNT_HASH manually from the dashboard (Images → Variants → Delivery URL, segment after imagedelivery.net/) and set it in .dev.vars; re-running will then skip this probe."
      );
    }
    throw new Error(`hash probe upload failed: ${fmtErrors(upJson)}`);
  }
  const url = upJson.result.variants?.[0] ?? "";
  const hash = url.match(/imagedelivery\.net\/([^/]+)\//)?.[1];
  // Delete the probe so we don't accumulate junk.
  await cfFetch<unknown>(
    `/accounts/${accountId}/images/v1/${upJson.result.id}`,
    { method: "DELETE", token }
  );
  if (!hash) throw new Error("could not extract account hash from variant URL");
  return hash;
}

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(DEV_VARS_PATH, "utf8");
  } catch {
    throw new Error(
      "No .dev.vars at project root — copy .dev.vars.example first."
    );
  }
  const env = parseDevVars(raw);

  const accountId = env.IMAGES_ACCOUNT_ID || env.R2_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      "Need IMAGES_ACCOUNT_ID (or R2_ACCOUNT_ID — same value) in .dev.vars."
    );
  }

  const tokenCandidates = [
    { name: "IMAGES_API_TOKEN", value: env.IMAGES_API_TOKEN },
    { name: "CLOUDFLARE_API_TOKEN", value: env.CLOUDFLARE_API_TOKEN },
  ].filter(c => c.value);
  if (tokenCandidates.length === 0) {
    throw new Error(
      "No token in .dev.vars. Add IMAGES_API_TOKEN with Images:Edit scope, or use an existing CLOUDFLARE_API_TOKEN that has Images:Edit."
    );
  }

  let token = "";
  let tokenSource = "";
  for (const c of tokenCandidates) {
    process.stdout.write(`Probing ${c.name}... `);
    const ok = await probeToken(c.value, accountId);
    process.stdout.write(ok ? "ok\n" : "no Images permission\n");
    if (ok) {
      token = c.value;
      tokenSource = c.name;
      break;
    }
  }
  if (!token) {
    throw new Error(
      "No usable token. Create one at https://dash.cloudflare.com/profile/api-tokens with the 'Cloudflare Images: Edit' template, then add it as IMAGES_API_TOKEN in .dev.vars."
    );
  }

  const existing = await listExistingVariants(token, accountId);
  process.stdout.write(
    `Existing variants: ${[...existing].join(", ") || "(none)"}\n`
  );

  for (const v of VARIANTS) {
    if (existing.has(v.id)) {
      process.stdout.write(`  ${v.id}: present\n`);
      continue;
    }
    process.stdout.write(
      `  ${v.id}: creating (${v.width}x${v.height}, scale-down)... `
    );
    await createVariant(token, accountId, v);
    process.stdout.write("ok\n");
  }

  const hash =
    env.IMAGES_ACCOUNT_HASH || (await discoverAccountHash(token, accountId));
  process.stdout.write(`Account hash: ${hash}\n`);

  const updates: Record<string, string> = {
    IMAGES_ACCOUNT_ID: accountId,
    IMAGES_ACCOUNT_HASH: hash,
    IMAGES_API_TOKEN: token,
  };
  const next = writeDevVars(raw, updates);
  if (next !== raw) {
    writeFileSync(DEV_VARS_PATH, next, "utf8");
    process.stdout.write(
      `Wrote IMAGES_* to ${DEV_VARS_PATH} (token from ${tokenSource})\n`
    );
  } else {
    process.stdout.write(".dev.vars unchanged.\n");
  }
}

main().catch(err => {
  process.stderr.write(`setup-cf-images failed: ${(err as Error).message}\n`);
  process.exit(1);
});

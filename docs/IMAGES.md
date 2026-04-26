# Image storage

Two distinct stores back the site's images. They behave differently because
the source material does.

## R2 — player photos (TT-36)

Player headshots come from Wikimedia Commons or World Table Tennis at known
high quality. The pipeline (scripts under `scripts/photo-sourcing/`) downloads
the original byte-perfect file, attaches license metadata, and pushes to the
`tt-reviews-prod` (prod) / `tt-reviews-dev` (local) R2 buckets via the
`IMAGE_BUCKET` Worker binding. Re-encoding would degrade quality and lose
EXIF/copyright metadata, so we don't.

Reads go through `app/routes/api.images.$.tsx` → `R2Bucket.get`.

Code: `app/lib/r2-native.server.ts`, `app/lib/imageUrl.ts`.

## Cloudflare Images — equipment photos (TT-48)

Equipment photos come from manufacturer/retailer pages and arrive in
arbitrary formats, sizes, and EXIF states. They need normalization (webp,
strip EXIF, resize to a small set of variants) before they're served. The
Workers runtime can't run sharp, so we hand the bytes to Cloudflare Images
and let it produce the variants.

Code: `app/lib/images/cloudflare.ts`.

### Variants

The helpers expose three variant names that must exist in the CF Images
dashboard:

| Name        | Use                                             |
| ----------- | ----------------------------------------------- |
| `thumbnail` | review queue grid + admin previews (~256px)     |
| `card`      | `EquipmentCard` listings (~512px)               |
| `full`      | `/equipment/:slug` detail page header (~1024px) |

If you change the variant set, update both the dashboard and
`CLOUDFLARE_IMAGE_VARIANTS` in `cloudflare.ts`.

### Setup

You need three values:

- **Account ID** — the UUID at the top right of the Cloudflare dashboard.
- **Account hash** — Images → Variants → "Delivery URL" path segment after
  `imagedelivery.net/`.
- **API token** — Profile → API Tokens → Create Token → use the
  "Cloudflare Images: Edit" template (or scope manually to
  `Account.Cloudflare Images: Edit`). Restrict to your account; do not
  add other scopes.

Local dev:

```sh
cp .dev.vars.example .dev.vars
# edit IMAGES_ACCOUNT_ID, IMAGES_ACCOUNT_HASH, IMAGES_API_TOKEN
```

Production:

```sh
wrangler secret put IMAGES_ACCOUNT_ID
wrangler secret put IMAGES_ACCOUNT_HASH
wrangler secret put IMAGES_API_TOKEN
```

### Rotating the token

1. In the Cloudflare dashboard, create a new token with the same scope.
2. `wrangler secret put IMAGES_API_TOKEN` and paste the new value.
3. Trigger a deploy (any push to `main`) so workers pick up the new secret.
4. Confirm a sourcing run still works (`/admin/equipment-photos` →
   "Re-source" any item).
5. Revoke the old token.

The account ID and hash do not change unless the CF account itself changes.

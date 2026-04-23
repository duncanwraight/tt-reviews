# Security policy

## Reporting a vulnerability

If you believe you've found a security issue in this project, please email
**duncan@wraight-consulting.co.uk** with a description, reproduction steps, and
any relevant logs or PoC. Please do not open a public GitHub issue for
undisclosed vulnerabilities.

You can expect an initial response within a few days. For confirmed issues I'll
coordinate on a fix timeline and credit you in release notes unless you prefer
to stay anonymous.

## Scope

In scope:

- The deployed site at <https://tabletennis.reviews>.
- Code in this repository.
- Supabase RLS policies under `supabase/migrations/`.

Out of scope:

- Findings that require privileged access (admin JWT, service-role key) that
  you were given legitimately.
- Social engineering, physical attacks, denial-of-service.
- Issues in third-party services (Cloudflare, Supabase) — report to the vendor.

## Hardening plan

The internal hardening plan lives at `archive/SECURITY.md`. Phases 1–10 have
shipped; that file tracks resolutions and the follow-up tickets filed on the
`tt-reviews` Plane board.

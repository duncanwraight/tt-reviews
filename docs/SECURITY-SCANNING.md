# Security Scanning

How TT Reviews catches security regressions: what runs on every CI build, what runs on a twice-weekly cron, and what we explicitly don't run and why.

This doc supersedes `archive/oss-web-vuln-scanning-research.md` (kept for the wider OSS landscape survey it captures). Where that doc gives a generic shortlist, this one is the project-specific plan grounded in the actual codebase.

## TL;DR

Two tiers:

- **Inline** — runs on every push / PR in the `checks` job of `.github/workflows/main.yml`. Sub-minute total overhead. Blocks the build.
- **Scheduled** — runs on a separate workflow on cron (Wed 16:30 UTC + Sun 18:00 UTC, ≈ 4:30pm + 7pm UK BST). Heavier scanners against production. Findings post to the Discord alerts channel; never blocks a deploy.

## What we already have (don't re-invent)

Listed here so future scanner additions don't duplicate work. See `.github/workflows/main.yml` for the canonical wiring.

| Check                                 | Where                  | Catches                                                                                     |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm audit --audit-level=high`        | `checks` job, blocking | Known CVEs in prod + build deps                                                             |
| `scripts/security-sweep.sh`           | `checks` job, blocking | RLS self-approval, `process.env` reads in server code, admin actions missing `validateCSRF` |
| `scripts/quality-sweep.sh`            | `checks` job, blocking | Raw `console.*`, `Record<string, any[]>` casts                                              |
| pgTAP RLS tests                       | `checks` job, blocking | RLS bypass per table (1,334 lines across `supabase/tests/`)                                 |
| Playwright e2e                        | `checks` job, blocking | Submit → moderate → verify lifecycle (auth, CSRF, role-gates)                               |
| Preview smoke + auto-rollback         | `deploy` job           | Broken-on-prod regressions caught before promote                                            |
| `validateEnv()` fail-fast             | Worker fetch entry     | Missing/placeholder env vars 503 the deploy instead of lazy-500 in prod                     |
| `sanitize-html` on user input         | Runtime                | Stored XSS in submitted JSON-LD + HTML                                                      |
| Signed-cookie CSRF (`SESSION_SECRET`) | Form actions           | Cross-site action forgery                                                                   |

## Inline checks (every CI build)

Each tool adds well under a minute to `checks` and blocks the build on findings. Findings upload as SARIF to the GitHub Security tab.

### Semgrep CE — TypeScript SAST

**Gap closed:** `security-sweep.sh` is grep-based — it catches the _named patterns_ we've previously been bitten by, but not novel taint flows. Semgrep CE adds dataflow/taint analysis with the community OWASP + React + Node rulesets.

**Hook:** new step in `checks` job, after `Security sweep`. Run via `returntocorp/semgrep-action` against `app/`, `workers/`, `scripts/`. Block on `error` severity, warn on `warning`.

**Acceptance:** SARIF uploads to GitHub Security tab; one canary finding (e.g., a deliberate `eval()` on a branch) triggers a red build.

### Gitleaks — secret scan on diff

**Gap closed:** there's no pre-commit or CI gate that catches an accidental `SUPABASE_SERVICE_ROLE_KEY` or `DISCORD_BOT_TOKEN` paste. High blast radius if leaked.

**Hook:** `gitleaks/gitleaks-action` in `checks`, scanning the PR diff (or full history on `main` pushes). Pre-commit hook via husky (`gitleaks protect --staged`) for local-first catch.

**Acceptance:** introducing a fake AWS key on a branch fails CI; pre-commit blocks the commit locally.

### Splinter + `supabase db lint` — DB advisory check

**Gap closed:** the Supabase dashboard's Security and Performance Advisors run [Splinter](https://github.com/supabase/splinter) lints (RLS-disabled-on-public-table, `SECURITY DEFINER` views without `set search_path`, missing indexes on FKs). Nothing in CI enforces them today — they only surface if someone opens the dashboard.

**Hook:** new step in `checks` after `RLS tests (pgTAP)`. Run `supabase db lint` against the local Postgres started earlier in the job; fail on `security`/`critical` advisors, warn on others. No extra services needed (CLI is already installed and pinned at 2.95.0).

**Acceptance:** a deliberately mis-scoped `SECURITY DEFINER` view on a branch fails the build.

## Scheduled checks (Wed 16:30 UTC + Sun 18:00 UTC)

New file: `.github/workflows/security-scheduled.yml`. Runs against the **production URL** (since cron isn't tied to a preview deploy). Findings post to the Discord alerts channel via `DISCORD_ALERTS_CHANNEL_ID` + `DISCORD_BOT_TOKEN`. Never blocks deploys — these are advisory.

Cron values are UTC and chosen to align with UK 4:30pm BST / 7pm BST. In GMT (winter) the jobs will fire one hour earlier in UK local time — acceptable for a maintenance scan.

```yaml
on:
  schedule:
    - cron: "30 16 * * 3" # Wed 16:30 UTC (= 17:30 BST / 16:30 GMT)
    - cron: "0 18 * * 0" # Sun 18:00 UTC (= 19:00 BST / 18:00 GMT)
  workflow_dispatch: # Manual trigger for ad-hoc runs
```

### OWASP ZAP baseline scan — DAST against production

**Gap closed:** nothing today exercises the running Worker for OWASP Top 10 — reflected/stored XSS, broken auth, missing security headers, weak cookie flags. The pgTAP + e2e suites cover happy-path behaviour but not adversarial probing.

**Hook:** `zaproxy/action-baseline` against `https://tabletennis.reviews`. Baseline mode (passive + spider, no active fuzzing) keeps runtime under ~10 min. Output: SARIF artifact + summary posted to Discord.

**Why baseline not full-scan:** baseline is passive + spider; full-scan adds active attacks. Active attacks against production can create junk DB rows (failed submissions, spam reviews) and rate-limit the Worker. If we ever want active scanning, do it against a preview deploy in a separate workflow gated on a label.

**Acceptance:** workflow runs Wed/Sun, posts the SARIF summary count + top three findings to the alerts channel. A canary endpoint with a known reflected-XSS sink (on a feature branch, not prod) is flagged on the next run.

### TruffleHog `--results=verified` — full-repo secret scan with provider verification

**Gap closed:** Gitleaks (inline, fast) catches _patterns_ that look like secrets. TruffleHog with `--results=verified` actually pings the provider (GitHub, AWS, Supabase, etc.) to confirm the secret is live. Slow enough that we don't want it on every build, but cheap enough for twice-weekly.

**Hook:** `trufflesecurity/trufflehog` action over the full git history with `--results=verified`. Findings post to Discord alerts channel with the verified provider + first 4 chars of the secret (never the full value).

**Acceptance:** seeding a known-revoked test token in history shows up; the same scan run against a clean repo posts a "0 verified findings" status to the channel.

## What we explicitly don't run, and why

The OSS landscape doc lists these — none warrant a slot in our pipeline today.

| Tool                                | Why skip                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schemathesis**                    | Schema-driven fuzzer that needs a public OpenAPI/GraphQL spec. We proxy everything through the Worker — PostgREST isn't internet-routable, no GraphQL, no public `openapi.json`. Revisit only if we ever expose PostgREST directly. |
| **Nuclei**                          | Signature-based template scanner. ZAP covers the same active-scan ground with much better stateful-auth handling, which we need. Overlap not worth the second job.                                                                  |
| **CodeQL**                          | Paid for private repos without a GitHub Code Security seat. Semgrep CE is the OSS-licence substitute.                                                                                                                               |
| **Trivy IaC / container modes**     | No Terraform / K8s / Helm. Workers Free doesn't ship an OCI image (wrangler bundles directly).                                                                                                                                      |
| **Trivy lockfile mode**             | Adds noise over `npm audit` (catches moderate CVEs that we'd otherwise ignore). Revisit if a moderate-severity supply-chain incident slips past `npm audit`.                                                                        |
| **Wapiti / Nikto / Arachni / w3af** | Superseded by ZAP or effectively unmaintained (per the research doc's findings, still accurate).                                                                                                                                    |

## Findings ingestion + triage

Where each scanner's output lands and who acts on it.

| Channel                                                  | Used by                                                       | Action                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **GitHub Security tab** (SARIF)                          | Semgrep CE, ZAP baseline                                      | Auto-aggregated; review when the badge appears on a PR. New file an Plane item for any unsuppressed finding.    |
| **CI red** (job fails)                                   | Inline tools (Semgrep error-sev, Gitleaks, Splinter sec/crit) | Block the merge; fix on the same branch.                                                                        |
| **Discord alerts channel** (`DISCORD_ALERTS_CHANNEL_ID`) | Scheduled cron (ZAP + TruffleHog)                             | Triage Wed evening / Sun evening. Verified secret → rotate + revoke immediately. ZAP medium+ → file Plane item. |

## Gotchas / constraints

- **No `process.env` in Worker code.** Scanners that read env via `process.env` are fine — they only run in the GitHub Actions Node runtime, not inside the Worker isolate. (See `CLAUDE.md` "Environment variables" for context on why `process.env` is banned at Worker runtime.)
- **Supabase CLI pin (2.95.0).** Splinter + `db lint` ship with the CLI; both must be available in 2.95.0. Verified on local install before merging the inline step.
- **Cloudflare 50-subrequest cap (Workers Free).** Scanners hit the Worker from outside; the cap applies to _outbound_ subrequests _the Worker itself_ makes, not inbound traffic. ZAP baseline against prod is fine.
- **DST drift in the cron schedule.** Cron is UTC; UK switches between BST (UTC+1) and GMT (UTC+0). Acceptable for advisory scans; if exact UK-local timing matters later, switch to a workflow-dispatch + external scheduler.

## Implementation tickets

Each inline tool + the cron workflow + this doc itself are scoped as separate Plane items under TT-227. See the TT-227 children for the per-tool acceptance criteria.

## See also

- `archive/oss-web-vuln-scanning-research.md` — original OSS landscape survey (not project-specific)
- `archive/SECURITY.md` — historical security-hardening phases (Phases 1–10, all shipped)
- `docs/RLS.md` — RLS patterns + the "never query `user_roles`" rule
- `docs/AUTH.md` — Supabase Auth + RBAC via JWT claims
- `CLAUDE.md` — env var registration, Cloudflare subrequest cap, Supabase CLI pin

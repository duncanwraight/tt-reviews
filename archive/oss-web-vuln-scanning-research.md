# OSS Web Vulnerability Scanning for a TypeScript + Supabase CI Pipeline

_Research date: 2026-05-14_

## 1. DAST / Web Application Scanners

| Tool                          | What it does well                                                                                                                                    | Weaknesses                                                                                                 | CI fit                                                                                                                                                                                    | Maintenance (May 2026)                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **OWASP ZAP**                 | Full active+passive proxy scanning, auth/session handling, OWASP Top 10 coverage, Automation Framework as code, API scan mode (OpenAPI/SOAP/GraphQL) | Heavy (JVM + browser), slow full scans, SARIF needs glue                                                   | Docker + three official GitHub Actions: `zaproxy/action-baseline`, `action-full-scan`, `action-api-scan`. JSON/HTML/MD/XML; SARIF via Automation Framework or `SvanBoxel/zaproxy-to-ghas` | **Active.** v2.17, weekly builds. Apache 2.0      |
| **Nuclei** (ProjectDiscovery) | 12k+ YAML templates, fast Go binary, very low false positives, great for CVE/misconfig sweeps                                                        | Template-driven — does _not_ crawl or fuzz business logic; weak on stored XSS, IDOR, RLS-style auth issues | Single binary, Docker, official Action `projectdiscovery/nuclei-action`, JSON/SARIF                                                                                                       | **Very active**, April 2026 template release. MIT |
| **Nikto**                     | Quick web-server-level checks: outdated software, dangerous files, default creds, headers                                                            | 1990s heuristic style, no SPA crawl, no auth flows                                                         | CLI + Docker, no first-party Action                                                                                                                                                       | **Active but niche.** v2.6.0 Feb 2026. GPLv3      |
| **Wapiti**                    | Python DAST with fuzzing for SQLi/XSS/SSRF/LFI/cmd-i, headless browser, good reports                                                                 | Smaller rule set than ZAP, slower than Nuclei                                                              | `pip install wapiti3`, Docker, no official Action                                                                                                                                         | **Active.** v3.3.0 May 2026. GPLv2                |
| **Arachni**                   | Historically excellent DOM-aware scanner                                                                                                             | OSS edition superseded by closed-source Spectre Scan                                                       | —                                                                                                                                                                                         | **Effectively obsolete.** Avoid for new pipelines |
| **w3af**                      | Broad plugin model                                                                                                                                   | Limited maintenance since 2020, Python 2 legacy                                                            | No real CI story                                                                                                                                                                          | **Not recommended.** GPLv2                        |

**ZAP vs Nuclei is the central trade-off.** ZAP _crawls and exploits_ a running app; Nuclei _fingerprints_ it against signatures. Complementary, not interchangeable.

## 2. SAST / Dependency / Secret Scanners

- **Semgrep CE** (LGPL-2.1) — solid TS/JS/TSX SAST, free community rules (OWASP, React, Node), SARIF, official Action, sub-minute scans. The credible OSS choice for TS.
- **CodeQL** — best-in-class TS taint analysis but **not free for private/non-OSS repos** without a GitHub Code Security seat. Use Semgrep CE as the OSS substitute.
- **Trivy** (Apache 2.0, Aqua) — scans lockfiles, Docker images, IaC (Terraform/K8s/Helm), and secrets in one tool. SARIF, official Action `aquasecurity/trivy-action`. Best all-in-one starter.
- **Grype** (Apache 2.0, Anchore) — narrower than Trivy (no IaC) but faster; pairs with Syft for SBOMs. Risk score blends CVSS + EPSS + CISA KEV.
- **Gitleaks** (MIT) — fast regex secret scan, ideal pre-commit; SARIF, GitHub Action.
- **TruffleHog** (AGPL-3.0) — slower but **verifies** secrets against live providers (`--results=verified`); best as the CI complement to Gitleaks pre-commit.

## 3. Supabase / Postgres / RLS Specifics

Honest answer: **no off-the-shelf DAST understands RLS.** RLS misconfiguration is the #1 critical finding in Supabase audits, and the only credible OSS path is to assert it yourself.

- **pgTAP + `pg_prove`** — Postgres' xUnit framework, ships with Supabase, runs via `supabase test db`. `SET LOCAL ROLE authenticated`, set JWT claims, assert user A can't see user B's rows. This is the load-bearing safety net.
- **`usebasejump/supabase-test-helpers`** (OSS, v0.0.6, actively maintained) — pgTAP helpers: `tests.create_supabase_user()`, `tests.authenticate_as()`, `tests.rls_enabled()`. Removes boilerplate.
- **Splinter** (`supabase/splinter`, Apache 2.0) — the SQL linter behind the Supabase dashboard's Security/Performance Advisors. Catches RLS-disabled-on-public-table, `SECURITY DEFINER` views, missing indexes. Runnable via SQL queries or `supabase db lint`. **Closest thing to a Supabase-aware static scanner that exists — add it.**
- **`supabase db lint`** — `plpgsql_check` under the hood; cheap to run; catches runtime errors in functions/triggers.
- **Snaplet** — pivoted away from OSS DB tooling in 2024; not a reliable option.

## 4. API-Specific Scanning (PostgREST + pg_graphql)

- **ZAP API Scan** (`zaproxy/action-api-scan`) — point at the OpenAPI spec PostgREST emits at `/rest/v1/` (or your `openapi.json`); ZAP imports endpoints and active-scans them. First-party GraphQL add-on with introspection + query fuzzing.
- **Schemathesis** (Apache 2.0, very active) — property-based fuzzer driven by OpenAPI/GraphQL. Independent academic benchmarks: 4.5x more unique defects than next-best API fuzzer. Excellent fit for PostgREST since it has a real schema. GitHub Action available.
- **Nuclei** — API/CVE templates but not a schema-driven fuzzer; complements rather than replaces Schemathesis/ZAP for API work.

## 5. Concrete Recommendation

**If you add ONE tool: OWASP ZAP**, via `zaproxy/action-baseline` on every preview deploy, escalating to `action-full-scan` weekly. It is the only OSS option that _exercises_ a running TS app with auth — reflected/stored XSS, broken auth, CSRF, missing security headers, and the long OWASP Top 10 tail that signature scanners can't see. Baseline is fast enough for PRs; the full scan covers what baseline skips.

**If you have appetite for three, layer them:**

1. **ZAP baseline scan** against the deployed preview URL — broad app-layer coverage.
2. **Splinter + pgTAP RLS tests** (`supabase test db`) — the only way to actually verify RLS. This is where Supabase apps get breached, and no DAST catches it. Use `supabase-test-helpers` to keep tests short.
3. **Schemathesis against the PostgREST OpenAPI spec** (or Nuclei for fast CVE sweeps) — schema-driven fuzzing turns the auto-generated REST surface into a security asset. Nuclei is the substitute if you want minutes-not-hours scan time.

Cheap secondary additions: **Semgrep CE** (TS SAST, free, fast), **Trivy** (deps + Docker + IaC, free, SARIF), **Gitleaks pre-commit + TruffleHog (`--results=verified`) in CI**.

**Why not Nuclei as the single pick?** Its template model produces low-false-positive findings, but it does not crawl, does not handle stateful auth flows well, and structurally cannot find business-logic bugs like IDOR or broken access control — _exactly_ the class of issue a TS + Supabase + RLS app is most likely to ship. ZAP first, Nuclei as a fast supplement.

**Avoid as primary tools in 2026:** Arachni (officially superseded), w3af (limited maintenance since 2020).

## Sources

- [ZAP releases (GitHub)](https://github.com/zaproxy/zaproxy/releases)
- [ZAP April 2026 Updates](https://www.zaproxy.org/blog/2026-05-01-zap-updates-april-2026/)
- [zaproxy/action-baseline](https://github.com/zaproxy/action-baseline)
- [ZAP API Scan docs](https://www.zaproxy.org/docs/docker/api-scan/)
- [SvanBoxel/zaproxy-to-ghas (SARIF shim)](https://github.com/SvanBoxel/zaproxy-to-ghas)
- [Nuclei (GitHub)](https://github.com/projectdiscovery/nuclei)
- [Nuclei Templates April 2026 release notes](https://projectdiscovery.io/blog/nuclei-templates-april-2026)
- [Nuclei authenticated scanning docs](https://docs.projectdiscovery.io/tools/nuclei/authenticated-scans)
- [Nikto (GitHub)](https://github.com/sullo/nikto)
- [Wapiti (GitHub)](https://github.com/wapiti-scanner/wapiti)
- [Arachni status / Spectre Scan successor](https://medevel.com/arachni/)
- [w3af review 2026](https://appsecsanta.com/w3af)
- [Semgrep CE in CI](https://semgrep.dev/docs/deployment/oss-deployment)
- [CodeQL CLI license](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md)
- [Trivy vs Grype 2026](https://appsecsanta.com/sca-tools/trivy-vs-grype)
- [Gitleaks vs TruffleHog 2026](https://appsecsanta.com/secret-scanning-tools/gitleaks-vs-trufflehog)
- [Supabase Splinter](https://github.com/supabase/splinter)
- [Supabase pgTAP testing docs](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)
- [usebasejump/supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers)
- [Precursor Security – Supabase security testing](https://www.precursorsecurity.com/blog/row-level-recklessness-testing-supabase-security)
- [Supabase Security Retro 2025](https://supabase.com/blog/supabase-security-2025-retro)
- [Schemathesis](https://github.com/schemathesis/schemathesis)
- [PostgREST DB authorization docs](https://docs.postgrest.org/en/v12/explanations/db_authz.html)

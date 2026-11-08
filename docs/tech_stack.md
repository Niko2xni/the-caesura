# Tech stack

Last verified: 2026-11-08. Everything below was checked against web sources on that date. Status key:

- **Verified**: confirmed from a primary or clearly current source.
- **Secondary**: found only in a third-party article, tracker or forum. Re-check before relying on it.
- **Not checked**: not looked up. Run the commands at the bottom before pinning.

No version is guaranteed free of vulnerabilities. This file reflects public advisories as of the date above. Pin exact versions (no `^` or `~`) and commit the lockfile.

## 1. Free-only check

The project must cost nothing. Every service below has a free plan that needs no card, with one exception to resolve (the AI model).

| Service | Plan | Limits that matter | At the limit | Status |
|---|---|---|---|---|
| Vercel (hosting, functions, cron) | Hobby | Non-commercial use only. About 100 GB transfer, 1M function invocations and 4 h Active CPU per month. 4.5 MB request body. Cron once a day. | The team is paused (up to 30 days). No overage bill. One-time unblock only. | Verified (Vercel docs, forum reports) |
| Neon Postgres (via Vercel Marketplace or direct) | Free | 100 CU-hours per project per month, 5 GB egress, scale to zero after 5 minutes (cold starts), 6-hour restore window. Storage is 0.5 GB or 1 GB depending on the source, so stay under 0.5 GB. | Compute is suspended until next month. | Verified (Neon docs); storage figure conflicts |
| Vercel AI Gateway | Free tier | $5 credit per 30 days, **only on a subset of models**, lower rate limits. Buying credits ends the free credit permanently. | A model outside the subset returns 403. Burst returns 429. Credit exhausted means requests fail. | Verified (Vercel docs). **Eligibility of `alibaba/qwen3.8-omni-flash` is not confirmed.** |
| GitHub (repo, Actions, Dependabot) | Free | Use a public repo so Actions minutes are not a concern | n/a | Not checked |
| Libraries | Open source | Believed MIT or Apache-2.0 | n/a | Not checked. Run `pnpm licenses list`. |
| Fonts | Google Fonts via `next/font` | Archivo, IBM Plex Sans (believed OFL) | n/a | Not checked |

**Open issue: the AI model.** The Gateway docs say free credit works only on a subset of models. The Qwen 3.8 Omni Flash page does not mark itself as eligible. Before building anything, run a ten-line script that sends one image to the model with your key.

- If it works, keep the model. At roughly 2,500 input and 1,500 output tokens per extraction (my estimate) the cost is about $0.001 each, so the global cap of 50 a day (about 1,500 a month) would use roughly $1.50 of the $5.
- If it returns 403 naming the free tier, set `EXTRACTION_MODEL` to a vision-capable model from the live free-tier list (`vercel.com/ai-gateway/models?freeTier=true`) and rerun the eval script. Third-party lists name candidates, but none are verified for image input.
- Never buy credits. Doing so ends the free tier for good.
- One forum thread reports the $5 credit not renewing, and Vercel's own pricing page says it renews. Treat the monthly credit as likely but not guaranteed, and keep manual receiving fully working.

Also free and card-free, but not used: Vercel Blob, Vercel BotID, Observability Plus. Paid, not used: Vercel Pro, Neon Launch.

## 2. Security baseline (public advisories as of 2026-11-08)

| Component | Pin | Why |
|---|---|---|
| Node.js | Latest 26.x patch. **A security release is scheduled for Nov 11, 2026 (highest severity HIGH)**, so install that release and do not stay on 26.12.1. | 26.12.1 (Oct 21) fixed 10 issues including a Brotli decompression flaw (CVE-2026-111497) that can lead to remote code execution, with public proof-of-concept code. Verified (nodejs.org, trade press). |
| Next.js | **16.4.5** minimum | My earlier pin of 16.4.3 is vulnerable. 16.4.5 (Nov 3) fixes seven advisories (one high: cache disclosure across requests with `use cache` and `unstable_cache`; six medium: Edge-runtime cookie exposure, image SVG bypass, self-hosted response handling, cache poisoning). 16.4.1 fixed two critical RCEs (Oct 14). 16.3.3 fixed a critical advisory from Aug 25. Verified (Netlify, Pantheon, GitHub advisories). |
| Drizzle ORM | 0.45.4 | CVE-2026-39356 (SQL injection through unescaped identifiers, CVSS 7.5) is fixed in 0.45.2. Only exploitable if user input reaches `sql.identifier` or alias names. Verified. |
| Better Auth | Latest 1.6.x, minimum **1.6.14** | 2026 advisories fixed through 1.6.14, including OAuth state (below 1.6.2), device authorization and OIDC defaults (below 1.6.11), XSS in deprecated plugins (below 1.6.13). This app uses email and password plus the anonymous plugin, none of the affected plugins, but stay current. Verified (Better Auth blog, GitHub advisories). |
| AI SDK (`ai`) | 7.0.x | `@ai-sdk/provider-utils` had resource-consumption and SSRF advisories in older lines (fixed in 3.0.28, 4.0.33, 5.0.1). After install, run `pnpm audit` and confirm the resolved provider-utils is not listed. Never pass user-supplied URLs to the model. Verified (GitHub advisories). |
| pnpm | 12.x (12.14.0 seen in an Oct 19 article) | pnpm 11 turned on a one-day `minimumReleaseAge` by default and blocks dependency build scripts. Secondary. |
| React 19.3.1, TypeScript 7.0, Vitest 4.1, Zod, postgres-js, decimal.js, Tailwind, shadcn/ui | see section 3 | Not checked for advisories. Covered by `pnpm audit` and Dependabot. |
| PostgreSQL 17 | Managed by Neon | Run `select version();` after creating the database and note the minor version. |

**Caveat on tooling.** GitHub's advisory database lagged nine days on one critical Next.js advisory in August, so `pnpm audit` and Dependabot can miss new ones. Also watch the Next.js and Node.js security pages directly.

### Hygiene that costs nothing

- `pnpm audit --prod` in CI, failing on high severity.
- GitHub Dependabot alerts and security updates on.
- Keep pnpm's default one-day `minimumReleaseAge` (1440 minutes). For an urgent patch, exclude that one package and version in `pnpm-workspace.yaml` after reading the advisory. Do not lower the default.
- Allow dependency build scripts only for packages that need them. Review each allowed package.
- No Edge runtime. Use the default Node.js runtime for route handlers.
- Leave Cache Components off. Several of the November Next.js advisories sit in that code path, and this app must not cache stock data anyway.
- Subscribe to the `nodejs-sec` mailing list. Check dependencies monthly.

## 3. Versions

### Runtime and language

| Item | Choice | Pin | Status | Notes |
|---|---|---|---|---|
| Node.js | 26.x LTS | `engines.node: "26.x"`, latest patch | Verified | 26 became Active LTS on Oct 28, 2026 (one source still calls it Current). Vercel made it the default runtime on Oct 29 (**Secondary**), so confirm in project settings. Fall back to 24.x (24.22.1 or later) if a dependency rejects 26. |
| Package manager | pnpm | 12.x | Secondary | Requires Node 22 or later. |
| TypeScript | 7.0.x | exact | Verified | Native compiler, same `tsc` command, stable since July 8, 2026. No stable programmatic API yet, so typed linting and codegen may break. Fallback: TypeScript 6.0 with the `@typescript/typescript6` compatibility package for those tools. 7.1 is in beta, do not use. |

### Application

| Item | Choice | Pin | Status | Notes |
|---|---|---|---|---|
| Framework | Next.js (App Router) | **16.4.5** | Verified | Active LTS line. |
| UI library | React | 19.3.1 | Secondary | |
| Styling | Tailwind CSS | 4.x | Verified major only | CSS-first config, no `tailwind.config.ts`. |
| Components | shadcn/ui (CLI v4) | CLI 4.x | Verified major only | Copied into the repo. Restyle to `design.md`. |
| Forms | React Hook Form with a Zod resolver | latest at scaffold | Not checked | Only for the review table. |
| Fonts | Archivo (variable), IBM Plex Sans | `next/font/google` | Not checked | |

### Data

| Item | Choice | Pin | Status | Notes |
|---|---|---|---|---|
| Database | PostgreSQL 17 | 17 | Verified | Neon supports 14 to 18. Use 18 only if the Neon console shows it as generally available. |
| Hosting | Neon Free | n/a | Verified | `pg_trgm` is supported. |
| ORM | Drizzle ORM | **0.45.4** | Verified | Do not use 1.0 yet. 1.0.0-rc.5 (Oct 21) is a pre-release with a new relations API and migration layout. One article calls 1.0 stable, which npm and GitHub contradict. |
| Migrations | drizzle-kit | 0.31.x matching 0.45.4 | Secondary | `generate --custom` for triggers, views, functions. |
| Driver | `postgres` (postgres-js), Neon pooled connection string | latest at scaffold | Not checked | Needs interactive transactions and `SELECT ... FOR UPDATE`. Do not use the Neon HTTP driver for ledger writes (it does not run interactive transactions; confirm in Drizzle's Neon docs). `prepare: false` behind a pooler. |
| Validation | Zod 4 | exact | Not checked | |
| Decimal math | decimal.js | exact | Not checked | |

### Auth

| Item | Choice | Pin | Status | Notes |
|---|---|---|---|---|
| Auth | Better Auth | 1.6.x, at least 1.6.14 | Verified | Do not use the 1.7 RC or 1.8 beta. Vercel acquired Better Auth in July 2026; Auth.js now sits under the same team. The anonymous plugin (`signIn.anonymous()`) is documented in 1.6. It adds `isAnonymous` to `user` and generates a placeholder email. |

### AI

| Item | Choice | Pin | Status | Notes |
|---|---|---|---|---|
| SDK | `ai` (AI SDK 7) | 7.0.x (7.0.143 on Oct 16) | Verified | ESM only. `generateObject` is deprecated. Use `generateText` with `output: Output.object({ schema })` and read `result.output`. Invalid output throws `NoObjectGeneratedError`. |
| Gateway | Vercel AI Gateway | n/a | Verified | Plain string model ids. Env var `AI_GATEWAY_API_KEY`. Budgets can cap spend per team, project, key or member. |
| Model | `alibaba/qwen3.8-omni-flash` (confirm free-tier eligibility, section 1) | env `EXTRACTION_MODEL` | Verified | Vision, structured output, tool calling, reasoning. 1M context. Released Sep 17, 2026. $0.15 per 1M input, $0.47 per 1M output tokens. |
| Reasoning | `reasoning` option (AI SDK 7) | env `EXTRACTION_REASONING`, start at `low` | Verified option | Accepts `none`, `minimal`, `low`, `medium`, `high`, `xhigh`. Tune with the eval script. |

### Quality

| Item | Choice | Pin | Status |
|---|---|---|---|
| Tests | Vitest | 4.1.x | Verified |
| End to end (optional) | Playwright | latest at scaffold | Not checked |
| CI | GitHub Actions with a Postgres 17 service container | n/a | Not checked |
| Lint and format | ESLint plus Prettier, or Biome | latest at scaffold | Not checked |

## 4. Platform limits that shape the design

- Request bodies are capped at 4.5 MB. Photos are resized in the browser first. Verified.
- Max function duration on Hobby is 300 s with Fluid compute, 60 s without. Set `maxDuration` on the extraction route. Verified.
- Hobby Active CPU is about 4 hours a month. Keep handlers light, make the nightly seed efficient (batched inserts), and never poll. A public guest demo is the most likely way to hit this. Verified.
- Hobby cron runs once a day, enough for the nightly reset. Secondary.
- Neon scales to zero after 5 minutes, so the first request after idle is slow. Show a loading state. Verified.
- Server Actions have a small default body limit (1 MB, check the Next.js docs), so the photo upload uses a route handler.

## 5. Rejected alternatives

| Option | Why not |
|---|---|
| FastAPI plus React | One language is easier to keep coherent in vibe-coding sessions, and you are strongest in TypeScript. |
| Prisma | Fine, but the stable line is 7.10 with 8.0 in RC. Drizzle keeps the SQL visible, which matters for the ledger. |
| Drizzle 1.0 RC | New relations API and migration layout, and coding assistants trained on 0.x will generate the wrong API. |
| Auth.js | Maintenance moved to the Better Auth team. |
| Image storage | Photos are never persisted. |
| Background queue | Extraction runs in one request, well under the time limit. |
| Paid tiers of anything | Project must cost nothing. |

## 6. Re-verify before scaffolding

```bash
node -v                                  # latest 26.x; after Nov 11, the new security release
pnpm view next dist-tags                 # latest must be >= 16.4.5
pnpm view ai dist-tags
pnpm view drizzle-orm dist-tags          # latest 0.45.x
pnpm view better-auth dist-tags          # stay on 1.6.x, >= 1.6.14
pnpm view typescript dist-tags
pnpm view zod version
pnpm view vitest version
pnpm audit --prod
pnpm licenses list
```

Then open https://vercel.com/ai-gateway/models/qwen3.8-omni-flash, confirm the model id, and send one test request to learn whether the free tier allows it.

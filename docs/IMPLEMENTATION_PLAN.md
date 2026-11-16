# Truce — Implementation Plan

Solo portfolio project. Tick items as slices land. Items marked **[verify]** must be checked against live docs before they are relied on.

**Data source changed on 2026-11-16:** the original film data source was replaced by the Streaming Availability API by Movie of the Night ("MOTN"). Reasons in `DECISIONS.md` 016. The pick algorithm, endpoints and risks below are the new version.

Model tags: **Fable 5.2** for planning and hard parts, **Opus 5.5** for routine work.

## Key decisions
Full reasoning goes in `DECISIONS.md` (Phase 2).
- **No user free text reaches the LLM.** Members are `P1..P8`; inputs are enums or film ids; the UI adds nicknames. Blocks prompt injection; Groq gets no personal data.
- **Services are a union.** The group watches one screen, so a film qualifies if anyone has the service (included with a subscription, or free; no rent or buy).
- **One region per room**, defaulted from the host's `request.cf.country`, editable by the host in the lobby.
- **One AI call per settle** returning a ranked top 3 with per-person reasons; vetoes walk down the list with no further AI calls. One settle at a time; the host can `reopen` the lobby after a result.
- **MOTN is the data source, behind one `Catalog` Durable Object** that caches responses and guards the 1,000-requests-a-month free plan (120 a day soft cap, 950 a month).
- **The Durable Object owns the state machine** and persists one JSON blob (`ctx.storage.put("room", state)`), one row write per mutation. No SQL schema.
- **Room code:** 10-char Crockford base32 from `crypto.getRandomValues` (50 bits). DO addressed with `idFromName(code)`; unknown codes return 404 and write nothing.
- **Identity:** 128-bit random member token on join, kept in `sessionStorage`, sent in the first WS message (never in a URL).
- **Minimal dependencies:** `react`, `zod`, one zero-dependency QR library (e.g. `uqr`). No router, no state library, no UI kit, plain CSS with tokens.
- **Tooling:** `@cloudflare/vite-plugin` (one `npm run dev` for client + Worker + DO), Vitest with `@cloudflare/vitest-pool-workers`.

## Phases

### Phase 0 — Repo cleanup and Claude setup · Opus 5.5
- [x] Remove the old Python prototype (`env/`, `main.py`); add `.gitignore`.
- [x] `CLAUDE.md`, `.claude/settings.json`, `.mcp.json` (Cloudflare docs MCP, URL verified), `docs/SETUP.md`, stub `README.md`.
- [x] `LICENSE` (all rights reserved).
- [x] Rename the GitHub repo to Truce and update the remote.
- [x] Delete stale remote `main`, rename `master` → `main` (owner approved).
- **Done when:** under 15 tracked files, no secrets tracked, a fresh clone opens in Claude Code without prompts for read/run commands.

### Phase 1 — Design exploration and choice · Fable 5.2 direction, Opus 5.5 mockups
- [x] Research with Claude in Chrome: brand-book structure, mobile decision/reveal UI, typography-led identities. Record links and notes (no copied images) in `docs/design/references.md`.
- [x] Five directions in `design/mockups/0N-<slug>/index.html`, each with the same three screens at 390 px (quick taps, lobby with QR, reveal with per-person reasons) and its own type, palette, motion idea and wordmark. Plus a sixth, 06 Night Ticket, a hybrid of 01 and 03 requested by the owner.
- [x] Run the `impeccable` design checker on each; real issues fixed, confirmed false positives recorded with reasons in `.impeccable/config.json`.
- [x] Owner picked **06 Night Ticket** → `docs/DESIGN_BRIEF.md` as the brand book.
- [ ] Check the mask-based ticket notches in Safari and Firefox (carry into Phase 3).
- **Done when:** one direction signed off; tokens ready as CSS custom properties.

### Phase 2 — Docs · Fable 5.2 for PRD, TRD, BACKEND_SCHEMA, SECURITY_PRIVACY; Opus 5.5 for the rest
| Doc | Contains |
|---|---|
| `README.md` | Pitch, demo GIF and link, how it works, stack, run commands, attribution, licence |
| `CLAUDE.md` | Rules, run commands, code map, quotas (under 40 lines) |
| `PRD.md` | Problem, users, competitors, MVP in/out, success criteria (median under 60 s with 3 people, one pick, zero unstreamable picks, $0) |
| `TRD.md` | Architecture diagram, stack and reasons, free-tier budget table, pick pipeline, test strategy |
| `APP_FLOW.md` | Screen-by-screen flow, phase diagram, edge states (reconnect, host leaves, no candidates, AI fallback, expired room) |
| `DESIGN_BRIEF.md` | Brand book from Phase 1 |
| `BACKEND_SCHEMA.md` | Room state, WS protocol, HTTP endpoints, limits |
| `SECURITY_PRIVACY.md` | Threat model, data inventory and retention, what goes to Groq and MOTN, limits, headers |
| `DECISIONS.md` | Short ADRs for each key decision above |
| `SETUP.md` | Fresh-machine setup, keys, global vs project Claude config |
- [x] All docs written (2026-11-16) and switched from TMDb to the Streaming Availability API (ADR 016).
- [ ] Owner has read PRD and TRD.
- **Done when:** docs agree with each other and with the protocol and pick sections below; owner has read PRD and TRD.

### Phase 3 — Slice 1: skeleton deployed · Opus 5.5
- [x] Scaffold Vite + React + TS + Cloudflare plugin; `wrangler.jsonc` with assets (`not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`), DO bindings (`ROOM`, `CATALOG`), `new_sqlite_classes` migration.
- [x] `GET /api/health`, design tokens, self-hosted fonts, landing screen, attribution footer (MOTN credit with link).
- [x] GitHub Actions CI: typegen, typecheck, test, build. Lint skipped for now: strict TypeScript covers it, add ESLint only if a need shows up.
- [x] Deploy to `*.workers.dev`: live at https://truce.arhamazad2004.workers.dev (health 200, SPA fallback, API 404).
- **Done when:** live URL renders the landing page and `/api/health` returns 200.

### Phase 4 — Slice 2: live room · Fable 5.2
- [x] `POST /api/rooms`; `Room` DO with hibernation, attachments, alarm expiry; `join {nickname, hostToken?}` / resume, presence; lobby with QR and Web Share.
- [x] Shared zod schemas and socket limits. WebSocket Origin check (own origin only) moved here from Phase 9.
- [x] Tests: join (with and without `hostToken`), join outside lobby, resume, duplicate nickname, room full, bad message, expiry.
- **Done when:** two phones see each other join/leave live, refresh resumes the same member, room is gone after its TTL.

### Phase 5 — Slice 3: inputs · Opus 5.5
- [x] Quick taps: mood, energy, time, services.
- [x] `Catalog` DO: MOTN client (`GET /countries`, `GET /shows/search/title`), trimmed cache, daily and monthly counters, `QUOTA_REACHED`. `GET /api/regions`, `GET /api/services?region=`, `GET /api/search?q=` served from it. Sample data when no key is set.
- [ ] With the real key, check the MOTN **[verify]** list in `TRD.md` §10. Checked live on 2026-11-16 (4 requests): `/countries` and title search parse correctly, numeric string ids, the `w240` poster key (signed URLs of about 470 chars on `cdn.movieofthenight.com`, about 18 KB each), and UAE services (Netflix, Prime Video, Apple TV, Mubi, Curiosity Stream, Crunchyroll, Zee5). A live settle on 2026-11-16 confirmed `/shows/search/filters`, `streamingOptions` and the `w360` poster key (pick in about 2 s, 3 requests). Still open: the status MOTN returns at quota, and the billing cycle (owner checks the dashboard).
- [x] Favourites picker (3-character minimum, 500 ms debounce, 3 films); ready states (edits clear ready; region change clears services); host's "Settle it" shown, opening at ≥ 2 ready (it starts the pick in Phase 6).
- **Done when:** a member finishes inputs in under 25 s on a phone; lobby shows who's ready without revealing answers; a room of 3 uses about 15 MOTN requests for search, measured.

### Phase 6 — Slice 4: deterministic pick (no AI) · Fable 5.2
- [x] Candidates, hard filters, scoring, template reasons; `settling` → `result`; reveal screen (plain fade; the printing motion is Phase 10). Host `reopen` moved here from Phase 8. This is the permanent fallback, shipped and tested first.
- [x] `Catalog.candidates` on `GET /shows/search/filters`; failed settle returns to `lobby` with a notice (`NO_CANDIDATES`, `PICK_FAILED`, `QUOTA_REACHED`).
- [x] Unit tests with fixture MOTN JSON.
- **Done when:** end-to-end flow gives one streamable pick with template reasons using 3 MOTN requests (5 at most) and at most 8 subrequests.

### Phase 7 — Slice 5: AI pick · Fable 5.2
- [x] Groq via one `fetch` to its OpenAI-compatible endpoint, no SDK (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`; unset key = step skipped), prompt contract, `json_schema` strict, zod validation, one retry inside one shared 12 s deadline, fallback on any failure.
- [x] Tests with a fake `fetch`: valid, hallucinated ID, missing member, over-long reason, 429, timeout, deadline spent.
- [x] Test that the prompt holds no overview, cast, nickname or token (MOTN terms: minimum data, inference only). The terms question that blocked this phase is closed by `DECISIONS.md` 016.
- Checked live on 2026-11-16 with the real model: five settles, each answered in under 4 s with valid output.
- **Done when:** valid AI ranking replaces the deterministic one; every failure silently yields the Phase 6 result; provider switch is env-only.

### Phase 8 — Slice 6: veto and edge states · Opus 5.5, Fable 5.2 review
- [ ] One veto per member → runner-up; host `reopen`; empty states (no candidates, list exhausted, quota reached / "Truce is resting", host disconnected with token resume, expired room, reconnect backoff).
- **Done when:** each member can veto once, no film repeats, no dead-end screen.

### Phase 9 — Hardening · Fable 5.2
- [ ] Rate-limit bindings **[verify Free plan]** (fallback: in-memory per-isolate counter), `public/_headers` (CSP with `img-src 'self' https://cdn.movieofthenight.com`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options`), message size and flood caps.
- [ ] `/security-review`, `npm audit`, grep `dist/` for secrets.
- **Done when:** every `SECURITY_PRIVACY.md` checklist row is ticked with evidence.

### Phase 10 — Deploy and portfolio polish · Opus 5.5
- [ ] Production secrets; optional custom domain; motion polish; Lighthouse and accessibility pass; timed 3-phone run (under 60 s).
- [ ] README with GIF and architecture diagram, in-app about/privacy sheet, final doc sync, tag `v1.0`.
- **Done when:** works on iOS Safari and Android Chrome, README portfolio-ready, Cloudflare, Groq and MOTN dashboards show $0. Timed runs reuse the same favourites so they hit the cache.

## Room state and protocol
Summary only; `BACKEND_SCHEMA.md` is the full contract.
```ts
Room {
  code; createdAt; expiresAt; region;          // ISO-3166-1
  phase: "lobby" | "settling" | "result" | "closed";   // closed is transient, set by the expiry alarm
  hostId; hostToken; settleAttempts; notice?;
  members: Record<id, {
    nickname; token;                            // token never broadcast
    answers?: { mood; energy; maxMinutes; serviceIds: string[] };
    favourites: { id; title; year; poster; genres; directors; cast }[]; // max 3, copied from the Catalog cache
    ready; vetoUsed;                            // connected is rebuilt from the sockets
  }>;
  result?: {
    ranking: { movieId; title; year; poster; runtime; services: {id, name}[];
               reasons: Record<memberId, string> }[];
    index: number;                              // current pick; veto increments
    pool; source: "ai" | "fallback";
    vetoes: { memberId; movieId }[]; exhausted;
  };
}
```
Clients get a public view only: per member id, nickname, ready, connected, vetoUsed; plus phase, region, notice and `ranking[index]`. Never other members' answers or lower-ranked films. `welcome` also carries a private `you` block.

**HTTP:** `POST /api/rooms` → `{code, hostToken}` · `GET /api/rooms/:code/ws` (upgrade, Origin-checked) · `GET /api/search?q=` · `GET /api/regions` · `GET /api/services?region=` · `GET /api/health`.

**WS client → server** (zod-validated, 2 KB max): `join {nickname, hostToken?}` (lobby only) or `resume {token}` first · `setAnswers` · `setFavourites {ids[≤3]}` (server copies film data from its cache) · `setReady` (needs answers + 1–3 favourites) · `setRegion` (host, lobby only; clears services and ready) · `settle` (host) · `veto` · `reopen` (host, after a result) · `ping` (auto-response `pong`, doesn't wake the DO).

**WS server → client:** `welcome {memberId, token, state, you}` · `state {public view}` (full snapshot each change) · `pong` · `error {code}`: `ROOM_FULL`, `NAME_TAKEN`, `BAD_MESSAGE`, `NOT_HOST`, `WRONG_PHASE`, `RATE_LIMITED`, `EXPIRED`, `VETO_USED`, `NO_CANDIDATES`, `PICK_FAILED`, `QUOTA_REACHED`.

**Limits** (`shared/limits.ts`): 8 members, 12 sockets per room; nickname 1–20 chars, NFKC-normalised, letters/digits/space/`-_'`, unique per room; 20 messages per 10 s per socket then close; one settle at a time, 5 attempts per room; TTL 4 h via `setAlarm` → `closed`, close sockets, `storage.deleteAll()`.

**DO pitfalls:** set and persist `phase = "settling"` before the first outbound `await` (awaiting releases the input gate); keep `memberId` in `ws.serializeAttachment`; rebuild `connected` from `ctx.getWebSockets()`.

## Pick algorithm (`worker/pick/`)
Replaces the first version (seed recommendations + discover + 18 detail calls, about 35 upstream calls per settle). Budget now: **3 MOTN requests per settle (5 at most), ≤ 8 subrequests** against the Workers Free cap of 50 per invocation (verified; Cache API calls share that cap, so it is not used). Per room of 3: about 18 MOTN requests, planning figure 25, so about 38 rooms a month on the 1,000-request free plan.
1. **Favourites** are already in room state with genres, directors and cast (cached when they appeared in a title search), so settle fetches nothing for them.
2. **Candidates:** `GET /shows/search/filters` through the Catalog, 20 films a page: mood genres by `popularity_1year` (pages 1 and 2) and the top favourite genres by `popularity_alltime` (page 1). Parameters: `country`, `catalogs` = union of services as `<id>.subscription,<id>.free`, `show_type=movie`, `genres` with `genres_relation=or`, `rating_min=60`. Pages cached 24 h.
3. **Hard filters** (AI can't override): subscription or free in the region on a service in the union; runtime known and ≤ group minimum + 10 (MOTN has no runtime filter, so this is checked after fetch); released; rating ≥ 60; not a favourite.
4. **Score:** per-member affinity (`0.6·genre overlap + 0.25·shared director or cast + 0.15·era`); group score `0.6·min + 0.4·mean` + mood/energy fit + small quality term; top 10 = `C`, the rest is the veto pool. Fewer than 3 → one more page, then runtime +20, then drop genres, then `NO_CANDIDATES`.
5. **AI call:** one call, temperature ~0.4, `maxRetries: 0`, one 12 s deadline shared with the retry. Input: `P1..Pn` enums + favourites' titles/years; candidates `{id, title, year, genres, runtime, serviceNames}`. No overviews, no cast. Rules: only given IDs, rank 3, one reason per member per film, second person, ≤ 140 chars, no invented facts, no names. Output `{ranking: [{id, reasons: [{member, text}]}]}` via `json_schema` strict (confirmed for `openai/gpt-oss-20b` on Groq, https://console.groq.com/docs/structured-outputs).
6. **Validate:** ids in `C` and distinct; exactly one reason per member; 1–140 chars, no URLs or control chars. Fail → one retry with the error if time remains; fail again / 429 / timeout → fallback.
7. **Fallback:** score order + template reasons from real overlap data; `source: "fallback"`; no visible error. Also used when `AI_API_KEY` is unset.
8. **Veto:** increments `index`; entries 3+ appended lazily from the pool with template reasons; when exhausted, "That's everything you can all stream." and the host can `reopen`. No repeats, no upstream calls.
9. **Failure:** `NO_CANDIDATES`, `PICK_FAILED` or `QUOTA_REACHED` → back to `lobby` with a message.

## Risks
| Risk | Mitigation |
|---|---|
| MOTN quota (1,000 requests a month) | About 25 requests per room; shared 30-day search cache; favourites cost 0; daily soft cap 120, monthly 950; "Truce is resting" state; fixtures in local dev. |
| MOTN shuts down or changes (one-person provider) | All MOTN code in the `Catalog` module; trimmed internal film shape; alternatives recorded in `DECISIONS.md` 016. |
| MOTN terms: no training or evaluating AI with the data | Inference only, once per settle, minimum fields, no overviews; nothing stored for model work. |
| Third-party images and names (no licence from MOTN) | Small posters to identify films only; services as text, no logos; remove on notice. |
| Attribution | "Streaming availability metadata and images are provided by Streaming Availability API by Movie of the Night" with link in the about sheet; short credit on landing and reveal. |
| UAE coverage | `ae` is listed in the docs with Netflix, Prime Video, Apple TV, Mubi, Curiosity Stream, Crunchyroll, Zee5; no Shahid, OSN+, StarzPlay or Disney+. Not yet confirmed with a live call **[verify]**. |
| IP / name collision | Originality audit in Phase 1; check "Truce" in app stores and trademark databases before publicising. |
| Room-code guessing | 50-bit codes, per-IP WS connect limit, uninformative 404, unknown codes never create storage. |
| Quota burn (Cloudflare) | Rate-limit bindings (create 5/min, search 30/min, WS connect 20/min), per-socket caps, ping auto-response, one write per mutation, cached debounced search. |
| Groq limits | One call per settle + ≤ 1 retry, ~1.2K-token prompt, silent fallback on 429. |
| Prompt injection / hallucination | No free text in prompt, IDs constrained, strict validation, hard filters first. |
| XSS / injection | React escaping only, nickname allow-list, CSP `img-src 'self' https://cdn.movieofthenight.com`, self-hosted fonts, server-held titles. |
| Cross-site WS / CSRF | Origin allow-list; no cookies; tokens in `sessionStorage` and WS body. |
| Secrets | `.dev.vars` gitignored and denied to Claude; `wrangler secret put` in production; bundle grep in Phase 9. |
| Privacy | Only nickname, taps, favourites; deleted within 4 h; no analytics or token logging; plain-language notice in app. |
| Bot room creation | Rate limit first; Turnstile only if abuse appears. |
| MOTN outage mid-settle | Partial data accepted when enough films are in hand; otherwise back to lobby with retry. |
| Sparse regional catalogue | Relaxation ladder; host can change region or reopen the lobby. |
| Old history (10 MiB venv) | Accepted: no secrets in it; rewriting history isn't worth breaking clone URLs. |

Deliberately skipped until a real need appears: router, state library, UI kit, Tailwind, SQL schema, diff sync, Turnstile, global AI quota counter, Playwright e2e, auto-deploy from CI.

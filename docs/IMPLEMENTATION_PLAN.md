# Truce — Implementation Plan

Solo portfolio project. Tick items as slices land. Items marked **[verify]** must be checked against live docs before they are relied on.

Model tags: **Fable 5.2** for planning and hard parts, **Opus 5.5** for routine work.

## Key decisions
Full reasoning goes in `DECISIONS.md` (Phase 2).
- **No user free text reaches the LLM.** Members are `P1..P8`; inputs are enums or TMDb IDs; the UI adds nicknames. Blocks prompt injection; Groq gets no personal data.
- **Services are a union.** The group watches one screen, so a film qualifies if anyone has the service (flatrate only).
- **One region per room**, defaulted from the host's `request.cf.country`, editable by the host in the lobby.
- **One AI call per room** returning a ranked top 3 with per-person reasons; vetoes walk down the list with no further AI calls.
- **The Durable Object owns the state machine** and persists one JSON blob (`ctx.storage.put("room", state)`), one row write per mutation. No SQL schema.
- **Room code:** 10-char Crockford base32 from `crypto.getRandomValues` (50 bits). DO addressed with `idFromName(code)`; unknown codes return 404 and write nothing.
- **Identity:** 128-bit random member token on join, kept in `sessionStorage`, sent in the first WS message (never in a URL).
- **Minimal dependencies:** `react`, `openai`, `zod`, one zero-dependency QR library (e.g. `uqr`). No router, no state library, no UI kit, plain CSS with tokens.
- **Tooling:** `@cloudflare/vite-plugin` (one `npm run dev` for client + Worker + DO), Vitest with `@cloudflare/vitest-pool-workers`.

## Phases

### Phase 0 — Repo cleanup and Claude setup · Opus 5.5
- [x] Remove the old Python prototype (`env/`, `main.py`); add `.gitignore`.
- [x] `CLAUDE.md`, `.claude/settings.json`, `.mcp.json` (Cloudflare docs MCP, URL verified), `docs/SETUP.md`, stub `README.md`.
- [ ] `LICENSE` (all rights reserved), once the copyright holder name is confirmed.
- [ ] Rename the GitHub repo to Truce and update the remote.
- [ ] With the owner's OK: delete stale remote `main`, rename `master` → `main`.
- **Done when:** under 15 tracked files, no secrets tracked, a fresh clone opens in Claude Code without prompts for read/run commands.

### Phase 1 — Design exploration and choice · Fable 5.2 direction, Opus 5.5 mockups
- [ ] Research with Claude in Chrome: brand-book structure, mobile decision/reveal UI, typography-led identities. Record links and notes (no copied images) in `docs/design/references.md`.
- [ ] Five directions in `design/mockups/01..05/index.html`, each with the same three screens at 390 px (quick taps, lobby with QR, reveal with per-person reasons) and its own type, palette, motion idea and wordmark.
- [ ] Run `impeccable`, `no-ai-design-slop` and `audit-reference-originality` on each.
- [ ] Owner picks one → `docs/DESIGN_BRIEF.md` as the brand book: principles, voice, wordmark, colour tokens, type scale, spacing, radius, motion, components, accessibility (WCAG AA, 44 px targets, reduced motion), attribution placement.
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
| `SECURITY_PRIVACY.md` | Threat model, data inventory and retention, what goes to Groq and TMDb, limits, headers |
| `DECISIONS.md` | Short ADRs for each key decision above |
| `SETUP.md` | Fresh-machine setup, keys, global vs project Claude config |
- **Done when:** docs agree with each other and with the protocol and pick sections below; owner has read PRD and TRD.

### Phase 3 — Slice 1: skeleton deployed · Opus 5.5
- [ ] Scaffold Vite + React + TS + Cloudflare plugin; `wrangler.jsonc` with assets (`not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`), DO binding, `new_sqlite_classes` migration.
- [ ] `GET /api/health`, design tokens, landing screen, attribution footer.
- [ ] Deploy to `*.workers.dev`; GitHub Actions CI (typecheck, lint, test, build).
- **Done when:** live URL renders the landing page and `/api/health` returns 200.

### Phase 4 — Slice 2: live room · Fable 5.2
- [ ] `POST /api/rooms`; `Room` DO with hibernation, attachments, alarm expiry; join/resume, presence; lobby with QR and Web Share.
- [ ] Shared zod schemas and socket limits.
- [ ] Tests: join, resume, duplicate nickname, room full, bad message, expiry.
- **Done when:** two phones see each other join/leave live, refresh resumes the same member, room is gone after its TTL.

### Phase 5 — Slice 3: inputs · Opus 5.5
- [ ] Quick taps: mood, energy, time, services.
- [ ] `GET /api/providers?region=`, `GET /api/search?q=` (proxied, trimmed, Cache API).
- [ ] Favourites picker (debounced, 3 films); ready states; host's "Settle it" enabled at ≥ 2 ready.
- **Done when:** a member finishes inputs in under 25 s on a phone; lobby shows who's ready without revealing answers.

### Phase 6 — Slice 4: deterministic pick (no AI) · Fable 5.2
- [ ] Candidates, hard filters, scoring, template reasons; `settling` → `result`; reveal screen. This is the permanent fallback, shipped and tested first.
- [ ] Unit tests with fixture TMDb JSON.
- **Done when:** end-to-end flow gives one streamable pick with template reasons within the subrequest budget.

### Phase 7 — Slice 5: AI pick · Fable 5.2
- [ ] Groq via `openai` SDK (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`), prompt contract, zod validation, one retry, fallback on any failure.
- [ ] Tests with a mocked client: valid, hallucinated ID, missing member, over-long reason, 429, timeout.
- [ ] Human read of current TMDb terms on sending metadata to an LLM before this goes public.
- **Done when:** valid AI ranking replaces the deterministic one; every failure silently yields the Phase 6 result; provider switch is env-only.

### Phase 8 — Slice 6: veto and edge states · Opus 5.5, Fable 5.2 review
- [ ] One veto per member → runner-up; empty states (no candidates, host disconnected with token resume, expired room, reconnect backoff).
- **Done when:** each member can veto once, no film repeats, no dead-end screen.

### Phase 9 — Hardening · Fable 5.2
- [ ] Rate-limit bindings **[verify Free plan]**, WS Origin check, `public/_headers` (CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options`), message size and flood caps.
- [ ] `/security-review`, `npm audit`, grep `dist/` for secrets.
- **Done when:** every `SECURITY_PRIVACY.md` checklist row is ticked with evidence.

### Phase 10 — Deploy and portfolio polish · Opus 5.5
- [ ] Production secrets; optional custom domain; motion polish; Lighthouse and accessibility pass; timed 3-phone run (under 60 s).
- [ ] README with GIF and architecture diagram, in-app about/privacy sheet, final doc sync, tag `v1.0`.
- **Done when:** works on iOS Safari and Android Chrome, README portfolio-ready, Cloudflare and Groq dashboards show $0.

## Room state and protocol
```ts
Room {
  code; createdAt; expiresAt; region;          // ISO-3166-1
  phase: "lobby" | "settling" | "result" | "closed";
  hostId;
  members: Record<id, {
    nickname; token;                            // token never broadcast
    answers?: { mood; energy; maxMinutes; providerIds: number[] };
    favourites: { id; title; year; poster }[]; // max 3, TMDb-sourced
    ready; vetoUsed; connected;
  }>;
  result?: {
    ranking: { movieId; title; year; poster; runtime; providers: number[];
               reasons: Record<memberId, string> }[];
    index: number;                              // current pick; veto increments
    source: "ai" | "fallback";
    vetoes: { memberId; movieId }[];
  };
}
```
Clients get a public view only: per member nickname, ready, connected, vetoUsed; plus phase, region and `ranking[index]`. Never other members' answers or lower-ranked films.

**HTTP:** `POST /api/rooms` → `{code, hostToken}` · `GET /api/rooms/:code/ws` (upgrade, Origin-checked) · `GET /api/search?q=` · `GET /api/providers?region=` · `GET /api/health`.

**WS client → server** (zod-validated, 2 KB max): `join {nickname}` or `resume {token}` first · `setAnswers` · `setFavourites {ids[≤3]}` (server re-fetches titles) · `setReady` · `setRegion` (host, lobby only) · `settle` (host) · `veto` · `ping` (auto-response, doesn't wake the DO).

**WS server → client:** `welcome {memberId, token, state}` · `state {public view}` (full snapshot each change) · `error {code}`: `ROOM_FULL`, `NAME_TAKEN`, `BAD_MESSAGE`, `NOT_HOST`, `WRONG_PHASE`, `RATE_LIMITED`, `EXPIRED`.

**Limits** (`shared/limits.ts`): 8 members, 12 sockets per room; nickname 1–20 chars, NFKC-normalised, letters/digits/space/`-_'`, unique per room; 20 messages per 10 s per socket then close; one settle per room; TTL 4 h via `setAlarm` → close sockets, `storage.deleteAll()`.

**DO pitfalls:** set and persist `phase = "settling"` before the first `await fetch` (fetches release the input gate); keep `memberId` in `ws.serializeAttachment`; rebuild `connected` from `ctx.getWebSockets()`.

## Pick algorithm (`worker/pick/`)
Budget ≤ 40 subrequests per settle **[verify Free-plan cap]**.
1. **Seeds:** dedupe favourites, cap 15 round-robin across members; `/movie/{id}/recommendations` each; remember which member each came from.
2. **Discover:** 2 pages of `/discover/movie` with `watch_region`, `with_watch_providers` (union, `|`), `with_watch_monetization_types=flatrate`, `with_runtime.lte=min(maxMinutes)+10`, `vote_count.gte=300`, `include_adult=false`, mood/energy → genre map.
3. **Shortlist:** merge, drop favourites, pre-score, top 18 → `/movie/{id}?append_to_response=watch/providers,keywords`.
4. **Hard filters** (AI can't override): flatrate in region and in the union; runtime ≤ group minimum + 10; not adult; released; not a favourite.
5. **Score:** per-member affinity (genre/keyword overlap with their favourites + bonus if from their recs); group score `0.6·min + 0.4·mean` + mood/energy fit + small quality term; top 10 = `C`. Empty → relax runtime +20, then drop mood genres, then `NO_CANDIDATES`.
6. **AI call:** one call, temperature ~0.4, 12 s timeout, `maxRetries: 0`. Input: `P1..Pn` enums + favourites' titles/years; candidates `{id, title, year, genres, runtime, keywords[≤3], providerNames}`. Rules: only given IDs, rank 3, one reason per member per film, second person, ≤ 140 chars, no invented facts, no names. Output `{ranking: [{id, reasons: [{member, text}]}]}` via `json_schema` strict **[verify gpt-oss-20b on Groq; else `json_object`]**.
7. **Validate:** ids in `C` and distinct; exactly one reason per member; 1–140 chars, no URLs or control chars. Fail → one retry with the error; fail again / 429 / timeout → fallback.
8. **Fallback:** score order + template reasons from real overlap data; `source: "fallback"`; no visible error.
9. **Veto:** increments `index`; entries 3+ appended lazily from score order with template reasons; when exhausted, "That's everything streamable; loosen a filter". No repeats.

## Risks
| Risk | Mitigation |
|---|---|
| TMDb terms on LLM use | Inference, not training; send minimal metadata; human read of terms before Phase 7 goes public; record in `DECISIONS.md`. |
| Attribution, non-commercial | TMDB logo (smaller than Truce mark) + notice + "Streaming data by JustWatch"; no ads; cache ≤ 24 h. |
| IP / name collision | Originality audit in Phase 1; check "Truce" in app stores and trademark databases before publicising; posters hotlinked from `image.tmdb.org`. |
| Room-code guessing | 50-bit codes, per-IP WS connect limit, uninformative 404, unknown codes never create storage. |
| Quota burn | Rate-limit bindings (create 5/min, search 30/min, WS connect 20/min), per-socket caps, ping auto-response, one write per mutation, cached debounced search. |
| Groq limits | One call per room + ≤ 1 retry, ~1.5K-token prompt, silent fallback on 429. |
| Prompt injection / hallucination | No free text in prompt, IDs constrained, strict validation, hard filters first. |
| XSS / injection | React escaping only, nickname allow-list, CSP `img-src 'self' https://image.tmdb.org`, server-fetched titles. |
| Cross-site WS / CSRF | Origin allow-list; no cookies; tokens in `sessionStorage` and WS body. |
| Secrets | `.dev.vars` gitignored and denied to Claude; `wrangler secret put` in production; bundle grep in Phase 9. |
| Privacy | Only nickname, taps, favourites; deleted within 4 h; no analytics or token logging; plain-language notice in app. |
| Bot room creation | Rate limit first; Turnstile only if abuse appears. |
| TMDb outage / subrequest cap mid-settle | Fixed budget, `Promise.allSettled`, partial data; total failure → back to lobby with retry. |
| Sparse regional catalogue | Relaxation ladder; host can change region. |
| Old history (10 MiB venv) | Accepted: no secrets in it; rewriting history isn't worth breaking clone URLs. |

Deliberately skipped until a real need appears: router, state library, UI kit, Tailwind, SQL schema, diff sync, Turnstile, global AI quota counter, Playwright e2e, auto-deploy from CI.

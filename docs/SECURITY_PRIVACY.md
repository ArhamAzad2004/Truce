# Truce — Security and Privacy

What Truce protects, from whom, and what data it touches. Shapes and limits referenced here are defined in [BACKEND_SCHEMA.md](BACKEND_SCHEMA.md); platform facts in [TRD §10](TRD.md#10-verified-platform-facts). The checklist in section 8 is ticked with evidence in Phase 9.

**Position in one paragraph:** no accounts, no cookies, no analytics. A room holds nicknames, a few taps and up to three film ids per person, and deletes itself after 4 hours. Users cannot type anything that reaches the language model. Secrets live only in the Worker. Film and streaming data come from the Streaming Availability API by Movie of the Night ("MOTN").

## 1. Threat model

**Assets**

| Asset | Why it matters |
|---|---|
| `MOTN_API_KEY`, `AI_API_KEY` | Theft burns the free quotas or gets the keys revoked |
| MOTN quota (1,000 requests a month) | The scarcest resource. Exhaustion rests the app for everyone until the next cycle |
| Other free-tier quota (Workers, Durable Objects, Groq) | Exhaustion takes the app down; the project must stay at $0 |
| Room integrity | A stranger settling, vetoing or impersonating a member spoils the room |
| Member answers and favourites | Never listed to others; the group-visible reason is derived from them and may mention one |
| Member and host tokens | Whoever holds one is that member |
| What appears on other people's screens | Nicknames and reasons are shown to the whole group |

**Actors:** a curious guest inside the room · an outsider guessing or leaked a room link · a bot creating rooms or hammering search · a malicious web page open in a member's browser · a compromised or misbehaving upstream (MOTN, Groq).

**Entry points:** `POST /api/rooms` · `GET /api/search` · `GET /api/regions` · `GET /api/services` · WebSocket upgrade · WebSocket frames · MOTN responses · the model's output · the static bundle.

**Threats and mitigations (STRIDE-lite)**

| # | Threat | Type | Mitigation | Residual risk |
|---|---|---|---|---|
| T1 | Impersonate a member or the host | Spoofing | 128-bit random token per member, sent only in the first WebSocket frame, never in a URL, never broadcast; the host seat is claimed with `hostToken` in `join` | Token readable by anyone with the unlocked phone |
| T2 | Guess a room code | Spoofing | 50-bit random codes; per-IP limit on upgrades; unknown codes return a plain 404 and write nothing | A shared link is a capability: anyone who has it can join while the room is in the lobby |
| T3 | Malicious site opens a socket from a member's browser | Spoofing | `Origin` must equal the app's own origin on upgrade; no cookies, so nothing rides along automatically | None known |
| T4 | Forge or oversize messages | Tampering | zod validation on every frame; 2 KB cap; phase and role checks in the room; films are copied from the server's cache by id, never taken from the client | None known |
| T5 | Script or markup in a nickname | Tampering / XSS | Allow-list of characters, NFKC, 20 chars; React text escaping only; CSP without inline script | Rude nicknames are possible (see section 7) |
| T6 | Prompt injection through user input | Tampering | No user free text reaches the model: members are `P1..Pn`, inputs are enums and film ids | A film title from MOTN could carry odd text; titles are length-capped and output validation limits the effect |
| T7 | Model invents a film, a fact or a link | Tampering | Ids must be in the shortlist; every film fact on screen comes from MOTN, not the model; reasons limited to 140 chars with no URLs or control characters; hard filters run first | A reason can still be bland or slightly off |
| T8 | Member reads another member's answers or the runner-up | Information disclosure | Public view excludes answers, favourites, tokens, lower-ranked films | Reasons shown to the group hint at each person's taste, by design |
| T9 | Secrets leak through the bundle, repo or logs | Information disclosure | Secrets only in `.dev.vars` (gitignored) and `wrangler secret put`; bundle grep before release; logs carry no tokens, codes, nicknames or prompts | Human error; covered by the checklist |
| T10 | Search flood burns the MOTN month | Denial of service | Per-IP rate limit (30 per minute); 3-character minimum; 30-day shared cache; daily soft cap of 120 with search stopping at 100; monthly cap of 950 | A slow, distributed flood of unique queries can still use up a day's cap. The app rests until the next day; nothing is billed |
| T11 | Room creation flood | Denial of service | Per-IP limit (5 per minute); creating a room costs no MOTN request; ping handled without waking the room | Limits are approximate and per location; a distributed flood can exhaust the Cloudflare daily free quota, which fails closed at $0 |
| T12 | Socket flood inside a room | Denial of service | 12 sockets per room, 20 messages per 10 s per socket then close, one write per mutation | Someone holding the link can occupy sockets before joining; the room is spoiled, nothing else is |
| T13 | Repeated settles burn MOTN and Groq quota | Denial of service | Host only; one settle at a time (`settling` persisted before the first call); 5 attempts per room; candidate pages cached 24 h, so a repeat costs no MOTN request; one shared AI deadline | A host can spend up to 5 AI calls (10 with retries) per room |
| T14 | Forged favourite ids used to trigger lookups | Denial of service | `setFavourites` reads the cache only and never calls MOTN | None known |
| T15 | Upstream outage, 429 or quota mid-settle | Denial of service | Partial data accepted when enough films are in hand; AI failure → silent fallback; data failure → back to lobby with a retry message | Pick quality drops with partial data |
| T16 | Upstream returns unexpected content | Tampering | MOTN responses are parsed with zod and trimmed; overviews are dropped; poster URLs must start with `https://cdn.movieofthenight.com/`; CSP `img-src` allows only that host | A wrong but well-formed film record would be shown as it is |
| T17 | Clickjacking | Elevation | `frame-ancestors 'none'` | None known |
| T18 | Non-host triggers host actions | Elevation | `NOT_HOST` check against `hostId` on the server for `setRegion`, `settle`, `reopen` | None known |
| T19 | Vulnerable dependency | Tampering | Four runtime dependencies; `npm audit` in the release check; lockfile committed | Zero-day in a dependency |

## 2. Data inventory

| Field | Source | Stored where | Retention | Who sees it | Sent to third parties? |
|---|---|---|---|---|---|
| Nickname | Typed by the member | Room object | ≤ 4 h | Everyone in the room | No |
| Member token / host token | Generated by the server | Room object; the member's `sessionStorage` | ≤ 4 h; tab close on the device | Only that member | No |
| Mood, energy, time | Taps | Room object | ≤ 4 h | Only that member | Groq, as enums under `P1..Pn` |
| Streaming services | Taps | Room object | ≤ 4 h | Only that member (the pick shows which service it is on) | MOTN, as the group's combined list of service ids |
| Favourite films (ids, titles) | Chosen from search results | Room object | ≤ 4 h | Only that member | Groq (titles and years under `P1..Pn`). Not sent to MOTN: the choice is read from the cache |
| Search text | Typed by the member | Catalog cache, keyed by the normalised query, with no link to a room or person | ≤ 30 days | Nobody | MOTN (the query only) |
| Region (country code) | Derived from the host's IP by Cloudflare, editable | Room object | ≤ 4 h | Everyone in the room | MOTN |
| Pick, reasons, vetoes | Computed | Room object | ≤ 4 h | Everyone in the room (current pick only) | No |
| Film records, candidate pages, country list | MOTN | Catalog cache | 30 days / 24 h / 7 days | Server only | No (this is MOTN's own data) |
| Request counters | Computed | Catalog | Current day and month | Server only | No |
| IP address | Network | Not stored or logged by Truce; used in memory for rate limiting | Request lifetime | Cloudflare as host | Cloudflare (infrastructure); MOTN's image CDN sees it when a poster loads |
| Logs | Worker | Workers Logs | Cloudflare's default log retention | Owner | No personal data in them (see [TRD §8](TRD.md#8-observability)) |

No names, emails, accounts, cookies, device identifiers, precise location or analytics events exist anywhere in the system. The Catalog cache holds film data and search strings only; it cannot be tied back to a person.

## 3. What goes to third parties

| Recipient | Exactly what | Never |
|---|---|---|
| **Groq** (one call per settle, plus at most one retry) | Per member: the label `P1..Pn`, mood, energy, time limit, and the titles and years of their favourites. Per candidate (max 10): film id, title, year, genre names, runtime, service names | Nicknames, tokens, room code, IP, region, any typed text, film overviews or descriptions, cast, posters |
| **MOTN API** (from the Catalog only) | Search text; the room's country; the group's service ids; genre and rating filters | Nicknames, tokens, room code, the member's IP, which member chose which film |
| **cdn.movieofthenight.com** (from the browser) | A poster request, which carries the member's IP and browser headers as any image load does. `Referrer-Policy: no-referrer` keeps the room link out of it | Anything from the room |
| **Cloudflare** | Everything, as the host and processor | n/a |

Fonts are self-hosted, so no font provider sees visitors. Groq and MOTN keep their own server logs under their own policies; Truce cannot delete those. The data sent to Groq contains nothing that identifies a person. It is used once, to rank a shortlist; Truce never uses MOTN data to train, fine-tune, evaluate or improve a model.

## 4. Secrets

- Two secrets: `MOTN_API_KEY`, `AI_API_KEY`. Local: `.dev.vars` (gitignored). Production: `npx wrangler secret put`.
- Never in `wrangler.jsonc`, the repo, the client bundle, logs, error messages or CI. CI has no Cloudflare or API credentials.
- `.dev.vars.example` lists names only.
- One MOTN account only. A second account to get more quota would break MOTN's terms.
- If a key leaks: revoke it in the provider console, issue a new one, `wrangler secret put`, redeploy. No user data is protected by these keys.

## 5. Security headers

Static assets, via `public/_headers`. API responses set `X-Content-Type-Options` and `Cache-Control` in the Worker, because `_headers` does not apply to Worker responses.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https://cdn.movieofthenight.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- `connect-src 'self'` covers the same-origin WebSocket.
- Fonts are self-hosted (`font-src 'self'`); there is no Google Fonts request at runtime.
- `Referrer-Policy: no-referrer` keeps the room code out of the `Referer` header on poster requests and on the attribution link.
- The QR code is drawn locally. No service logos are loaded; services are text labels.
- The attribution link opens `https://www.movieofthenight.com/about/api` with `rel="noopener noreferrer"`.

## 6. Rate limits

| Scope | Limit | Enforced by |
|---|---|---|
| Any API call from another website | Refused with 403 (`Sec-Fetch-Site` / `Origin` must be Truce's own) | Worker |
| Create room | 5 per minute and 6 per day per client address | Catalog object (`allow`) |
| Settle | 10 per day per client address (the host's) | Room object, counted in the Catalog |
| Search + regions + services | 30 per minute per client address | Catalog object (`allow`) |
| New searches (not already cached) | 25 per day per client address | Catalog object (`search`) |
| WebSocket upgrade | 20 per minute per client address | Catalog object (`allow`) |
| Messages per socket | 20 per 10 s, then close | Room object |
| Sockets per room | 18 (8 members x 2 tabs, plus slack); at most 2 per member (a third closes the oldest with code 4001); sockets that never joined are dropped first | Room object |
| Members per room | 8 | Room object |
| Frame size | 2 KB | Room object |
| Settle | one at a time; 5 attempts per room | Room object |
| AI calls | at most 2 per settle, inside one 12 s deadline | Pick pipeline |
| MOTN requests | 120 per UTC day (search stops at 100); 950 per month | Catalog object |

Per-address limits are counted in the Catalog object's memory, keyed by `CF-Connecting-IP` (IPv6 by its /64 prefix, after expanding `::`). The Catalog is a singleton, so the counts are exact and global. Addresses are never written to storage or logs; ended windows are dropped at least hourly, and all counters vanish when the object sleeps. A room keeps each socket's address in the socket's hibernation attachment (not storage) only to count settles.

**Storage sweep.** The Catalog runs a daily alarm that deletes search entries (`q:`) older than 30 days, candidate pages (`c:`) older than 24 hours, and past day and month counters. Film records (`f:`) are public film data, not user data, and are kept. Cloudflare's Rate Limiting binding was not used: its docs do not say whether it is free, and its counts are approximate and per location (checked 2026-11-16).

**Accepted risk.** The daily budgets (rooms, new searches, settles) stop one person or one network from draining the shared film allowance, and the cross-site check stops other websites from spending their visitors' budgets. Someone with many addresses (a botnet, or a rotating proxy) can still push Truce into its resting state for a day by running new searches or by opening rooms and settling with varied answers (up to 25 upstream calls per room). The damage is bounded: nothing is billed, cached answers keep working, and the caps reset. Closing it fully would need accounts or a challenge page, which are out of scope for v1.

## 7. Abuse handling

- **Rude nicknames:** no word filter in v1. Nicknames are short, limited to a safe character set, visible only inside a room people were invited to, and gone in 4 hours.
- **Bots creating rooms:** rate limit first. Turnstile is added only if abuse actually appears.
- **Quota exhaustion:** MOTN stops answering at its limit and charges nothing; Truce's own caps stop earlier and show "Truce is resting". Workers Free fails closed (requests error) rather than billing. Groq 429 → fallback pick.
- **Kill switches:** unset `AI_API_KEY` to turn the AI step off; redeploy with room creation returning 503 to pause the app.
- **Takedown:** if MOTN or a rights holder asks for a poster or title to be removed, delete the cached record and block the id.
- **Reports:** a contact link in the about sheet (the repository's issue tracker; no personal email in the app).

## 8. Pre-launch checklist

Tick in Phase 9, each with evidence (test name, command output or screenshot). Unticked rows are still open: CSP on a real phone, a manual read of the logs (per-request logs are switched off in `wrangler.jsonc`, so URLs with room codes and search text are not recorded), the resting screen by hand, the about sheet (Phase 10), and third-party requests in a network tab.

**Secrets and build**
- [x] `git ls-files` shows no `.dev.vars` and no keys; `.gitignore` covers it — checked 2026-11-16: `git ls-files` has no `.dev.vars` or `.env`; the review also found none in git history
- [x] Grep of `dist/` finds no `MOTN_API_KEY` or `AI_API_KEY` values, no `X-API-Key` and no `Bearer ` strings — checked 2026-11-16: grep of `dist/client` for key names, `X-API-Key`, `Bearer ` and API hosts found nothing
- [x] `npm audit` shows no high or critical issues in runtime dependencies — `npm audit`: 0 vulnerabilities (2026-11-16)
- [x] Production secrets set with `wrangler secret put`; `wrangler.jsonc` contains none — `wrangler secret list` shows `MOTN_API_KEY` and `AI_API_KEY`; `wrangler.jsonc` holds only the AI base URL and model name

**Transport and headers**
- [x] `curl -I` on the live URL shows the CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options` — live on `/`, `/new`, `/r/<code>` and assets, 2026-11-16
- [ ] No CSP violations in the console across all screens on a phone
- [x] WebSocket upgrade with a foreign `Origin` returns 403 (test) — `room.test.ts` "guards the socket route"; also 403 on the live site

**Room protocol**
- [x] Unknown room code returns 404 and creates no storage (test) — `room.test.ts` "guards the socket route"
- [x] Oversized, malformed and wrong-phase frames are rejected; `join` outside the lobby returns `WRONG_PHASE` (tests) — `room.test.ts` "rejects bad messages", "refuses a join outside the lobby"
- [x] Non-host `settle`, `setRegion` and `reopen` return `NOT_HOST` (test) — `pick.test.ts` "settles for the ready members", `picks.test.ts` "lets only the host change region"
- [x] Second veto by the same member returns `VETO_USED` (test) — `pick.test.ts` veto test; also on the live site
- [x] Double `settle` race produces one settle; the sixth attempt is refused (tests) — `pick.test.ts` "settles for the ready members" (double tap), `room.test.ts` "refuses a sixth settle"
- [x] Captured `state` frames contain no token, no other member's answers, no lower-ranked film (test) — `room.test.ts` "seats the host", `picks.test.ts` "saves answers and favourites privately", `pick.test.ts` (pick keys only)
- [x] Message flood closes the socket; 13th socket is refused (tests) — `room.test.ts` "closes a flooding socket", "refuses a thirteenth socket"
- [x] Nickname allow-list rejects `<`, `>`, control characters and over-long input (test) — `room.test.ts` "rejects bad messages" (`<script>`, 2,048-char name)

**AI and data**
- [x] The prompt builder's output contains no nickname, token, room code, overview or cast (test with a distinctive nickname and a fixture overview) — `ai.test.ts` "sends the model only labels, taps and titles"
- [x] Hallucinated id, missing member, long reason, URL in reason, 429, timeout and a spent deadline all end in the fallback (tests) — `ai.test.ts` fallback cases, rate limit, timeout, spent deadline
- [x] A favourite id the Catalog has not seen is rejected without an upstream call (test) — `picks.test.ts` "rejects services outside the region and films it has never listed"
- [x] A poster URL on any host other than `cdn.movieofthenight.com` is dropped (test) — `picks.test.ts` "keeps only the fields Truce uses"

**Limits and lifecycle**
- [x] Rate-limit bindings deploy on the Free plan and return 429 past the limit (manual) — replaced by the Catalog limiter (section 6): `picks.test.ts` "rate limits"; the sixth `POST /api/rooms` in a minute returned 429 on the live site
- [ ] Daily and monthly MOTN caps return `QUOTA_REACHED` and send no upstream request (tests); the resting screen shows (manual)
- [x] Room storage is empty after the alarm; the code then returns 404 (test) — `room.test.ts` "expires"
- [ ] Logs for a full session contain no nickname, token, room code, IP or search text (manual read)

**Privacy and attribution**
- [x] About sheet shows the privacy notice below and the MOTN attribution sentence with its link — `SiteFooter` in `src/components/Attribution.tsx`, on Landing and Reveal
- [x] Attribution line visible on every reveal and on the landing footer — Landing footer and Reveal footer render `Attribution`
- [x] No service logos anywhere; services are text — services render as text labels and tags only
- [ ] No third-party requests other than `cdn.movieofthenight.com` (network tab); fonts load from the app's own origin
- [x] The MOTN items marked [verify] in [TRD §10](TRD.md#10-verified-platform-facts) checked with a real key — endpoints, fields, posters and UAE services checked live; the quota reply and the billing cycle are still open
- [x] `/security-review` run and findings closed — independent review 2026-11-16: 0 critical, 1 high, 1 medium, 5 low. All fixed except the many-address quota drain, recorded as an accepted risk in section 6; second independent review 2026-11-16: 0 critical, 1 high, 2 medium, 6 low, all fixed in code (settle budget, cross-site check, storage sweep, IPv6 key, socket cap, alarm order, window sweep, HSTS, SHA-pinned CI actions). Personal email in the first commit and GitHub repo settings are owner decisions

## 9. Third-party terms

Checked 2026-11-16.

**Streaming Availability API by Movie of the Night** (terms: https://developers.movieofthenight.com/terms-and-conditions · pricing: https://www.movieofthenight.com/about/api/pricing)

| Term | How Truce meets it |
|---|---|
| Free plan: 1,000 requests and 1 GB image bandwidth a month; access paused at the limit; no overage | Request budget, cache and caps in [TRD §3](TRD.md#3-free-tier-budget); resting state in the app |
| Commercial and consumer use allowed, including on the free plan | No restriction on how Truce is offered |
| Caching and storing data and images allowed for as long as the app needs | Catalog cache: 7 days, 30 days and 24 h |
| No use of the data to train, fine-tune, evaluate or improve ML/AI systems | The data is only sent once per settle as a shortlist to rank. Nothing is logged, stored for model work, or used in evaluations. Tests use hand-trimmed fixtures to test Truce's own code, not to assess a model |
| No reselling or redistribution as a data product; no competing API | Truce exposes only trimmed search results and one pick to its own app |
| No getting round limits, no multiple accounts, no scraping beyond normal API use | One account, one key, caps below the plan limit |
| Attribution (section 4 of the terms) when showing streaming information and images | The sentence "Streaming availability metadata and images are provided by Streaming Availability API by Movie of the Night", linked to https://www.movieofthenight.com/about/api, in the about sheet; a short credit line on the landing footer and every reveal |
| Third-party content (section 5): posters, artwork, service names and logos, and show descriptions belong to others; MOTN grants no licence to them; remove on notice | Posters shown only to identify a film, at small sizes, loaded from MOTN's CDN. Service names as plain text, no logos. Overviews are dropped at the server and never shown or sent to the model. Takedown step in section 7 |

**Inference is not training.** The terms bar training-type uses; they do not bar sending a shortlist to a model to rank it once. Truce still sends the minimum: title, year, genres, runtime and service names.

**Risks that remain**
- Posters and titles are other people's property. Showing a small poster to identify a film is normal practice, but MOTN's terms give no licence for it, so the risk sits with Truce. Keep posters small, never use them for promotion, and act on any removal request.
- MOTN is run by one person (Germany). The API could change, raise prices or close. The Catalog is the only code that knows MOTN's shapes, so a replacement touches one module.
- UAE coverage is thin for local services: the docs list Netflix, Prime Video, Apple TV, Mubi, Curiosity Stream, Crunchyroll and Zee5 for `ae`, and no Shahid, OSN+, StarzPlay or Disney+. Confirm with a live `/countries` call.

**Groq:** free tier, key kept server-side, no personal data sent.

## 10. Privacy notice (about sheet text)

> **Your privacy**
>
> Truce has no accounts and no tracking.
>
> **What we keep, and for how long.** Your nickname, the answers you tap, and the films you pick as favourites. They live in your room and are deleted automatically 4 hours after the room was opened. Cloudflare, which hosts Truce, may keep a recovery copy of stored data for up to 30 days; we never restore rooms from it. We guess the room's country from the host's connection so we can check what is streaming there; the host can change it.
>
> **Who sees what.** Everyone in your room sees your nickname, whether you are ready, and the reason the pick fits you. Your taps and your three films are never shown as a list, and nobody sees them in the lobby. The reason on the final ticket is written from them, so it may name a film you picked or the mood you chose, and everyone in the room can read it.
>
> **Who else is involved.** Film details, posters and streaming availability come from the Streaming Availability API by Movie of the Night. When you search for a film, it receives your search words, but not your nickname or who you are. We keep search words and results for up to 30 days, then delete them, so the same search is faster next time; they are not linked to you. Posters load straight from its image servers, so they see your device's IP address, as any website does when it shows you an image. When the pick is ranked by a language model, it receives the group's tapped answers and favourite film titles labelled only as "P1", "P2" and so on. It never receives your nickname or anything you typed. The app runs on Cloudflare.
>
> **Stopping abuse.** We count requests per network address for up to a day so one person cannot use up the service for everyone. The count is held in memory only. It is never saved or logged.
>
> **What we do not do.** No cookies, no ads, no analytics, no selling or sharing of data.
>
> **On your phone.** A random key is kept in this browser tab so you can refresh without losing your seat. It is gone when you close the tab.
>
> Streaming availability metadata and images are provided by [Streaming Availability API by Movie of the Night](https://www.movieofthenight.com/about/api).

If the AI step is off in production (`AI_API_KEY` unset), drop the language-model sentence.

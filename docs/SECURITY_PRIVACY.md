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
| Member answers and favourites | Promised private ("Nobody else sees your answers") |
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
| Create room | 5 per minute per IP | Rate Limiting binding `RL_CREATE` |
| Search + regions + services | 30 per minute per IP | Rate Limiting binding `RL_SEARCH` |
| WebSocket upgrade | 20 per minute per IP | Rate Limiting binding `RL_WS` |
| Messages per socket | 20 per 10 s, then close | Room object |
| Sockets per room | 12 | Room object |
| Members per room | 8 | Room object |
| Frame size | 2 KB | Room object |
| Settle | one at a time; 5 attempts per room | Room object |
| AI calls | at most 2 per settle, inside one 12 s deadline | Pick pipeline |
| MOTN requests | 120 per UTC day (search stops at 100); 950 per month | Catalog object |

The binding is generally available and takes 10 s or 60 s windows; its counts are approximate and separate per Cloudflare location. Whether it is included on the Workers Free plan is **not verified** in the docs (checked 2026-11-16); confirm with a deploy in Phase 9. Fallback: an in-memory per-IP counter in the Worker isolate.

## 7. Abuse handling

- **Rude nicknames:** no word filter in v1. Nicknames are short, limited to a safe character set, visible only inside a room people were invited to, and gone in 4 hours.
- **Bots creating rooms:** rate limit first. Turnstile is added only if abuse actually appears.
- **Quota exhaustion:** MOTN stops answering at its limit and charges nothing; Truce's own caps stop earlier and show "Truce is resting". Workers Free fails closed (requests error) rather than billing. Groq 429 → fallback pick.
- **Kill switches:** unset `AI_API_KEY` to turn the AI step off; redeploy with room creation returning 503 to pause the app.
- **Takedown:** if MOTN or a rights holder asks for a poster or title to be removed, delete the cached record and block the id.
- **Reports:** a contact link in the about sheet (the repository's issue tracker; no personal email in the app).

## 8. Pre-launch checklist

Tick in Phase 9, each with evidence (test name, command output or screenshot).

**Secrets and build**
- [ ] `git ls-files` shows no `.dev.vars` and no keys; `.gitignore` covers it
- [ ] Grep of `dist/` finds no `MOTN_API_KEY` or `AI_API_KEY` values, no `X-API-Key` and no `Bearer ` strings
- [ ] `npm audit` shows no high or critical issues in runtime dependencies
- [ ] Production secrets set with `wrangler secret put`; `wrangler.jsonc` contains none

**Transport and headers**
- [ ] `curl -I` on the live URL shows the CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options`
- [ ] No CSP violations in the console across all screens on a phone
- [ ] WebSocket upgrade with a foreign `Origin` returns 403 (test)

**Room protocol**
- [ ] Unknown room code returns 404 and creates no storage (test)
- [ ] Oversized, malformed and wrong-phase frames are rejected; `join` outside the lobby returns `WRONG_PHASE` (tests)
- [ ] Non-host `settle`, `setRegion` and `reopen` return `NOT_HOST` (test)
- [ ] Second veto by the same member returns `VETO_USED` (test)
- [ ] Double `settle` race produces one settle; the sixth attempt is refused (tests)
- [ ] Captured `state` frames contain no token, no other member's answers, no lower-ranked film (test)
- [ ] Message flood closes the socket; 13th socket is refused (tests)
- [ ] Nickname allow-list rejects `<`, `>`, control characters and over-long input (test)

**AI and data**
- [ ] The prompt builder's output contains no nickname, token, room code, overview or cast (test with a distinctive nickname and a fixture overview)
- [ ] Hallucinated id, missing member, long reason, URL in reason, 429, timeout and a spent deadline all end in the fallback (tests)
- [ ] A favourite id the Catalog has not seen is rejected without an upstream call (test)
- [ ] A poster URL on any host other than `cdn.movieofthenight.com` is dropped (test)

**Limits and lifecycle**
- [ ] Rate-limit bindings deploy on the Free plan and return 429 past the limit (manual)
- [ ] Daily and monthly MOTN caps return `QUOTA_REACHED` and send no upstream request (tests); the resting screen shows (manual)
- [ ] Room storage is empty after the alarm; the code then returns 404 (test)
- [ ] Logs for a full session contain no nickname, token, room code, IP or search text (manual read)

**Privacy and attribution**
- [ ] About sheet shows the privacy notice below and the MOTN attribution sentence with its link
- [ ] Attribution line visible on every reveal and on the landing footer
- [ ] No service logos anywhere; services are text
- [ ] No third-party requests other than `cdn.movieofthenight.com` (network tab); fonts load from the app's own origin
- [ ] The MOTN items marked [verify] in [TRD §10](TRD.md#10-verified-platform-facts) checked with a real key
- [ ] `/security-review` run and findings closed

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
> **What we keep, and for how long.** Your nickname, the answers you tap, and the films you pick as favourites. They live in your room and are deleted automatically 4 hours after the room was opened. We guess the room's country from the host's connection so we can check what is streaming there; the host can change it.
>
> **Who sees what.** Everyone in your room sees your nickname, whether you are ready, and the reason the pick fits you. Nobody else sees your answers or your favourites.
>
> **Who else is involved.** Film details, posters and streaming availability come from the Streaming Availability API by Movie of the Night. When you search for a film, it receives your search words, but not your nickname or who you are. We keep search results for up to 30 days so the same search is faster next time; they are not linked to you. Posters load straight from its image servers, so they see your device's IP address, as any website does when it shows you an image. When the pick is ranked by a language model, it receives the group's tapped answers and favourite film titles labelled only as "P1", "P2" and so on. It never receives your nickname or anything you typed. The app runs on Cloudflare.
>
> **What we do not do.** No cookies, no ads, no analytics, no selling or sharing of data.
>
> **On your phone.** A random key is kept in this browser tab so you can refresh without losing your seat. It is gone when you close the tab.
>
> Streaming availability metadata and images are provided by [Streaming Availability API by Movie of the Night](https://www.movieofthenight.com/about/api).

If the AI step is off in production (`AI_API_KEY` unset), drop the language-model sentence.

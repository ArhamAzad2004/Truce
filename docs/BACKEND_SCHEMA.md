# Truce — Backend Schema and API

The contract between the browser, the Worker, the Room Durable Object and the Catalog Durable Object. The code source of truth is `shared/protocol.ts` (zod schemas) and `shared/limits.ts`; a change there updates this file in the same commit.

Film and streaming data come from the **Streaming Availability API by Movie of the Night** (called "MOTN" in these docs). Items marked **[verify]** could not be confirmed from the public docs and must be checked with a real key in Phase 5.

There is no database schema. Each room is one JSON value stored under the key `room` in its own Durable Object (`ctx.storage.kv.put("room", state)`), written once per mutation. The Catalog object keeps cache entries and two counters as plain keys (section 7).

## 1. Room state (private, server only)

```ts
type Mood   = "cosy" | "funny" | "tense" | "moving" | "mind_bending" | "feel_good";
type Energy = "half_asleep" | "awake" | "wired";
type MaxMinutes = 90 | 120 | 150 | null;              // null = no limit
type Service = { id: string; name: string };          // MOTN service id, e.g. "netflix"

type Favourite = {                // copied from the Catalog's cache, never from the client
  id: string; title: string; year: number | null; poster: string | null;
  genres: string[];               // MOTN genre ids
  directors: string[]; cast: string[];   // cast capped at 5
};

type Film = {                     // one candidate, already trimmed
  movieId: string; title: string; year: number; poster: string | null;
  runtime: number; rating: number; genres: string[]; directors: string[]; cast: string[];
  services: Service[];            // subscription or free, already limited to the group's union
};

type Room = {
  code: string;                 // 10-char Crockford base32
  createdAt: number;            // epoch ms
  expiresAt: number;            // createdAt + 4 h
  region: string;               // ISO-3166-1 alpha-2, upper case ("AE"); sent to MOTN in lower case
  phase: "lobby" | "settling" | "result" | "closed";
  hostId: string | null;        // set when the host joins
  hostToken: string;            // issued by POST /api/rooms; becomes the host's member token
  settleAttempts: number;       // capped, see limits
  notice?: "NO_CANDIDATES" | "PICK_FAILED" | "QUOTA_REACHED";  // why the last settle failed; cleared when the next one starts
  members: Record<string, {     // key = memberId (short random id)
    nickname: string;
    token: string;              // 128-bit random; never broadcast
    answers?: { mood: Mood; energy: Energy; maxMinutes: MaxMinutes; serviceIds: string[] };
    favourites: Favourite[];    // max 3
    ready: boolean;
    vetoUsed: boolean;
  }>;
  result?: {
    ranking: (Film & { reasons: Record<string, string> })[];  // memberId -> reason
    index: number;              // current pick; a veto increments it
    pool: Film[];               // remaining candidates in score order, for lazy veto entries
    source: "ai" | "fallback";
    vetoes: { memberId: string; movieId: string }[];
    exhausted: boolean;
  };
};
```

- `connected` is not stored. It is rebuilt from `ctx.getWebSockets()`; each socket carries its `memberId` in `ws.serializeAttachment`.
- `poster` is a full URL on `https://cdn.movieofthenight.com/` (it carries an `Expires` query value; MOTN says image URLs stay valid for 6 to 12 months). The server rejects any other host. The client uses the URL as it is.
- Film ids are MOTN show ids: strings such as `"82"`. Validated as `/^[a-z0-9]{1,16}$/i` (real ids seen on 2026-11-16 are numeric strings such as `"27669"`).
- No film overview or description is ever stored in a room.

## 2. Public view (what clients receive)

```ts
type PublicState = {
  code: string; region: string; phase: Room["phase"]; expiresAt: number; hostId: string | null;
  members: { id: string; nickname: string; ready: boolean; connected: boolean; vetoUsed: boolean }[];
  settlesLeft: number;          // 5 minus the attempts used
  notice?: Room["notice"];
  pick?: { movieId: string; title: string; year: number; poster: string | null;
           runtime: number; services: Service[]; reasons: Record<string, string> };  // ranking[index] only
  exhausted?: boolean;          // true when every streamable candidate has been vetoed
};
```

Never sent: tokens, other members' answers or favourites, lower-ranked films, the candidate pool, `source`, ratings, cast. A member's own answers and favourites come back only in the private `you` block of their own `welcome`.

## 3. HTTP endpoints

All under the app's own origin. JSON in and out. Errors are `{ "error": "<CODE>" }` with the status shown. Rate limits are per client IP per 60 s (approximate, per Cloudflare location).

| Method and path | Request | 200 response | Errors | Rate limit |
|---|---|---|---|---|
| `GET /api/health` | none | `{ "ok": true }` | none | none |
| `POST /api/rooms` | empty body | `{ "code": "7K3M9QX2TB", "hostToken": "<22 chars>" }` | 429 `RATE_LIMITED`, 503 `QUOTA_REACHED` | 5 |
| `GET /api/rooms/:code/ws` | WebSocket upgrade; `Origin` must equal the app's own origin | 101 | 400 `BAD_REQUEST` (malformed code), 403 `FORBIDDEN_ORIGIN`, 404 `NOT_FOUND` (unknown or expired; writes nothing), 426 `UPGRADE_REQUIRED` (room exists, not an upgrade), 429 `RATE_LIMITED` | 20 |
| `GET /api/search?q=` | `q`: 3 to 60 chars after trim | `[{ "id": "82", "title": "The Godfather", "year": 1972, "poster": "https://cdn.movieofthenight.com/…" }]` (max 8, movies only) | 400 `BAD_REQUEST`, 429 `RATE_LIMITED`, 502 `UPSTREAM`, 503 `QUOTA_REACHED` | 30 |
| `GET /api/regions` | none | `[{ "code": "AE", "name": "…" }]` (the countries MOTN supports) | 429, 502, 503 as above | 30 (shared with search) |
| `GET /api/services?region=` | `region`: two letters | `[{ "id": "netflix", "name": "Netflix" }]` (up to 12, in MOTN's popularity order; services that offer subscription or free viewing). `[]` for a country MOTN does not cover | 400, 429, 502, 503 as above | 30 (shared with search) |

- `POST /api/rooms` generates the code and host token with `crypto.getRandomValues`, sets `region` from `request.cf.country` (falls back to `US` when the country is missing, not supported by MOTN, or the country list could not be loaded), initialises the room and sets the expiry alarm. It answers 503 `QUOTA_REACHED` while the data quota is used up, so nobody opens a room that cannot finish.
- A browser cannot read the status of a failed WebSocket handshake. When a socket never opens, the client sends a plain `GET` to the same path: 404 means "no such room", 426 means the room exists and the failure was the network.
- The Origin check compares the `Origin` header with the origin of the request URL, so there is no allow-list to configure. It applies to upgrades only.
- Search results: titles that contain the whole query come first, best-rated first; the rest keep MOTN's order. (MOTN alone lists obscure exact matches above well-known films.) A query cached before this rule keeps its old order for 30 days.
- Search, regions and services are trimmed views served by the Catalog object (section 7). No MOTN key and no raw MOTN response reaches the client.
- `QUOTA_REACHED` bodies carry `"scope": "day"` or `"month"` so the client can say when Truce is back.
- API responses send `Cache-Control: no-store` (except search, regions and services: `public, max-age=3600`) and `X-Content-Type-Options: nosniff`.

## 4. WebSocket protocol

Text frames, JSON, one object per frame, discriminated on `type`. A room handles one message at a time, in arrival order, so `setFavourites` followed at once by `setReady` is safe. Inbound frames over 2 KB or failing validation get `error BAD_MESSAGE`. The first frame must be `join` or `resume`; anything else closes the socket. `join` and `resume` are refused with `BAD_MESSAGE` on a socket that already has a member.

### Client → server

| `type` | Fields | Who / when | Effect |
|---|---|---|---|
| `join` | `nickname: string` (1 to 20, see limits) · `hostToken?: string` | Anyone, **lobby only** (`WRONG_PHASE` otherwise) | Creates a member. With the room's `hostToken`, that member takes the host seat and keeps the token as their member token. A wrong `hostToken` is `BAD_MESSAGE`. A repeated host join (the first `welcome` was lost) re-attaches to the host seat in any phase |
| `resume` | `token: string` (22 chars) | Any phase | Re-attaches the socket to an existing member |
| `setAnswers` | `mood: Mood` · `energy: Energy` · `maxMinutes: 90 \| 120 \| 150 \| null` · `serviceIds: string[]` (1 to 12, each `/^[a-z0-9]{2,20}$/` and offered in the room's region) | Member, lobby | Stores answers; clears that member's `ready` |
| `setFavourites` | `ids: string[]` (1 to 3 distinct film ids) | Member, lobby | Server copies title, year, poster, genres, directors and cast from the Catalog's cache for each id. An id that never appeared in a search result is rejected with `BAD_MESSAGE`, so this message never costs an upstream request. Clears that member's `ready` |
| `setReady` | `ready: boolean` | Member, lobby; needs answers (with at least one service) and 1 to 3 favourites. The UI asks for 3 | Sets the flag |
| `setRegion` | `region: string` (`/^[A-Z]{2}$/`, must be a supported country) | Host, lobby | Changes region; clears every member's `serviceIds` and `ready` |
| `settle` | none | Host, lobby, at least 2 ready members, attempts left | Runs the pick for the ready members. One settle at a time |
| `veto` | none | Member with a reason on the current pick, `result` phase, veto unused | Moves to the next film |
| `reopen` | none | Host, `result` phase | Back to `lobby`. Keeps members, answers and favourites; clears every `ready` and `vetoUsed` and drops `result`. This is the way out when the veto list is exhausted |
| `ping` | none; the exact string `{"type":"ping"}` | Any | Answered `{"type":"pong"}` by `setWebSocketAutoResponse` without waking the object |

```json
{"type":"join","nickname":"Sam","hostToken":"q0Zk3Vb1m8J2hT5xYw9LdA"}
{"type":"join","nickname":"Noor"}
{"type":"resume","token":"q0Zk3Vb1m8J2hT5xYw9LdA"}
{"type":"setAnswers","mood":"funny","energy":"awake","maxMinutes":120,"serviceIds":["netflix","prime"]}
{"type":"setFavourites","ids":["82","1534","90211"]}
{"type":"setReady","ready":true}
{"type":"settle"}
{"type":"veto"}
{"type":"reopen"}
{"type":"ping"}
```

### Server → client

| `type` | Fields | When |
|---|---|---|
| `welcome` | `memberId: string` · `token: string` · `state: PublicState` · `you: { answers?, favourites }` (private to this member; favourites as `{id, title, year, poster}`) | Reply to `join` or `resume`, to that socket only |
| `state` | `state: PublicState` | To every joined socket after each change (full snapshot, no diffs) |
| `you` | `you: { answers?, favourites }` | To a member's own sockets whenever their private data changes: after their `setAnswers` or `setFavourites`, and to every member after `setRegion` (their `serviceIds` were cleared) |
| `error` | `code: ErrorCode` · `scope?: "day" \| "month"` (only with `QUOTA_REACHED`) | To the sending socket only |
| `pong` | none | Auto-response to `ping` |

```json
{"type":"welcome","memberId":"m_4f2a","token":"q0Zk3Vb1m8J2hT5xYw9LdA",
 "state":{"code":"7K3M9QX2TB","region":"AE","phase":"lobby","expiresAt":1794700000000,"hostId":"m_4f2a",
          "members":[{"id":"m_4f2a","nickname":"Sam","ready":false,"connected":true,"vetoUsed":false}]},
 "you":{"favourites":[]}}
{"type":"state","state":{"code":"7K3M9QX2TB","region":"AE","phase":"result","expiresAt":1794700000000,"hostId":"m_4f2a",
  "members":[{"id":"m_4f2a","nickname":"Sam","ready":true,"connected":true,"vetoUsed":false},
             {"id":"m_9c1e","nickname":"Noor","ready":true,"connected":true,"vetoUsed":true}],
  "pick":{"movieId":"1234","title":"Example Film","year":2019,"poster":"https://cdn.movieofthenight.com/show/1234/poster/vertical/en/360.jpg?Expires=1816221558",
          "runtime":104,"services":[{"id":"netflix","name":"Netflix"}],
          "reasons":{"m_4f2a":"You wanted funny and under two hours; this is both.","m_9c1e":"It has the dry wit of your favourites."}}}}
{"type":"error","code":"NAME_TAKEN"}
{"type":"error","code":"QUOTA_REACHED","scope":"month"}
{"type":"pong"}
```

### Error codes

| Code | Meaning | Socket after |
|---|---|---|
| `BAD_MESSAGE` | Not JSON, over 2 KB, unknown type, failed validation, an unknown `resume` token, or a favourite id the Catalog has not seen | Open (closed if it was the first frame) |
| `ROOM_FULL` | 8 members already, or 12 joined sockets. At 12 sockets the room first closes sockets that never joined | Closed (1008) |
| `NAME_TAKEN` | Nickname in use in this room (compared case-insensitively after NFKC) | Open; client may retry `join` |
| `NOT_HOST` | Host-only message (`setRegion`, `settle`, `reopen`) from a non-host | Open |
| `WRONG_PHASE` | Message not allowed in the current phase or state (join after the lobby, settle with fewer than 2 ready, settle while one is running, no attempts left) | Open |
| `RATE_LIMITED` | More than 20 messages in 10 s on this socket | Closed (1008) |
| `EXPIRED` | Room reached its TTL | Closed (4000) |
| `VETO_USED` | Member already used their veto | Open |
| `NO_CANDIDATES` | Nothing streamable survived the relaxation ladder; room returns to `lobby` | Open |
| `PICK_FAILED` | The data source did not answer: during settle (room returns to `lobby`), or while checking `setAnswers` or `setRegion` (nothing is changed) | Open |
| `QUOTA_REACHED` | The data quota (daily soft cap or monthly limit) is used up; a settle returns the room to `lobby`, other messages change nothing | Open |

A failed settle sends the `error` to the host's socket and also sets `notice` in the public state, so guests see the same message.

## 5. Limits (`shared/limits.ts`)

| Limit | Value |
|---|---|
| Members per room | 8 |
| Sockets per room | 12 |
| Nickname | 1 to 20 chars after trim and NFKC; letters, digits, space, `-`, `_`, `'`; unique per room |
| Inbound frame | 2 KB |
| Messages per socket | 20 per 10 s, then close |
| Favourites per member | 3 (ready needs at least 1) |
| Service ids per member | 12 |
| Search query | 3 to 60 chars; the client waits 500 ms after the last keystroke |
| Settles | One at a time; at most 5 attempts per room (failed ones count) |
| Vetoes | 1 per member per result; `reopen` resets them |
| Room code | 10 chars, Crockford base32, 50 bits |
| Member token | 128 bits, base64url (22 chars) |
| Room TTL | 4 h from creation |
| MOTN requests per settle | 3 normally, at most 5 with the relaxation ladder |
| Subrequests per settle | ≤ 8 from the room (≤ 6 Catalog calls + ≤ 2 AI calls); platform limit 50, see [TRD §10](TRD.md#10-verified-platform-facts) |
| AI call | One shared 12 s deadline across the attempt and its one retry; no other retries |
| MOTN soft caps | 120 requests per UTC day (search stops at 100 so open rooms can still settle); 950 per calendar month |
| Cache lifetimes | Countries and services 7 days · title search and film records 30 days · candidate pages 24 h |

## 6. Lifecycle and alarm

```
POST /api/rooms ──► lobby ──settle──► settling ──► result ──(alarm)──► closed ──► storage deleted
                      ▲                  │            │
                      ├── NO_CANDIDATES / PICK_FAILED / QUOTA_REACHED
                      └────────────── reopen (host) ──┘
```

- **Create:** state written once, `setAlarm(expiresAt)`.
- **Unknown code:** the object finds no `room` key, answers 404 and writes nothing.
- **Join:** lobby only. The host's first frame is `join {nickname, hostToken}`.
- **Editing:** `setAnswers` and `setFavourites` clear that member's `ready`. `setRegion` clears everyone's `serviceIds` and `ready`.
- **Settle:** `phase = "settling"` and `settleAttempts + 1` are stored **before** the first `await`, so a second `settle` arriving while calls are in flight gets `WRONG_PHASE`. A failure stores `phase = "lobby"` plus `notice`; the host may try again. If the object restarts mid-settle, the next load finds `settling` with no pick running and returns the room to `lobby` with `PICK_FAILED`.
- **Reopen:** host only, from `result`. Clears `result`, every `ready` and every `vetoUsed`.
- **Disconnect:** closing a socket only changes `connected`. The member, their answers and their veto remain until expiry. The host can resume with their token; host rights never transfer.
- **Alarm:** set `phase = "closed"` (a transient phase, seen only by sockets open at that moment), send `error EXPIRED`, close every socket with 4000, then `ctx.storage.deleteAll()`. After that the code returns 404.
- **Hibernation:** the object sleeps between messages. The flood counter lives in memory and resets when it sleeps, which only happens when the socket is idle.

## 7. Data source: Catalog object and MOTN calls

**Catalog** is a single Durable Object (`idFromName("catalog")`). It is the only code that calls MOTN. It caches trimmed responses, counts requests, and enforces the soft caps. Rooms and the Worker call it through its methods; a cache hit costs no MOTN request.

MOTN base URL `https://api.movieofthenight.com/v4`, header `X-API-Key: <MOTN_API_KEY>`, `output_language=en` (the default).

| Catalog method | Used by | MOTN endpoint | Parameters | Cached |
|---|---|---|---|---|
| `countries()` | `/api/regions`, `/api/services`, `POST /api/rooms`, `setRegion`, `setAnswers` | `GET /countries` | none | 7 days (one request a week covers every country and its services) |
| `search(q)` | `/api/search` | `GET /shows/search/title` | `title`, `country=us`, `show_type=movie`, `series_granularity=show` | 30 days, keyed by the normalised query. Each film in the result is also stored as a film record |
| `film(id)` | `setFavourites` | none | | Reads the film record only. A miss returns nothing; it never calls MOTN |
| `candidates(query, cursor?)` | settle | `GET /shows/search/filters` | `country`, `catalogs`, `show_type=movie`, `genres`, `genres_relation=or`, `rating_min=60`, `order_by`, `cursor` | 24 h, keyed by a hash of the parameters |
| `status()` | `POST /api/rooms`, landing | none | | Reads the counters |

Confirmed in the MOTN docs (2026-11-16): the four endpoints above, `GET /shows/{id}` (accepts a MOTN id or an IMDb id; not used by Truce), `GET /genres`, cursor pagination (`hasMore`, `nextCursor`), 20 movies per page, and the parameter names in the table. The docs list `country` as required for title search and say the country does not change which titles match, so the cache key leaves it out **[verify]**. There is **no runtime filter**, so runtime is checked after fetch.

**Fields kept from a show** (everything else, including `overview`, is dropped before caching): `id`, `title`, `releaseYear`, `runtime`, `rating` (0 to 100), `genres[].id`, `directors`, `cast` (first 5), `imageSet.verticalPoster` (`w240` for search rows, `w360` for the reveal; only the `w240` key was seen in the docs sample, the other widths are documented **[verify key names]**), and for candidates `streamingOptions[country][]` → `service.id`, `service.name`, `type`. Titles are capped at 120 chars with control characters removed.

**Catalogs parameter.** For each service in the group's union: `<id>.subscription` and `<id>.free` (for example `netflix.subscription,netflix.free,prime.subscription,prime.free`). Up to 12 services gives 24 entries; MOTN allows 32. Rent, buy and add-on options are never requested and never count as streamable.

**Genres.** MOTN genre ids (confirmed): `action`, `adventure`, `animation`, `comedy`, `crime`, `documentary`, `drama`, `family`, `fantasy`, `history`, `horror`, `music`, `mystery`, `news`, `reality`, `romance`, `scifi`, `talk`, `thriller`, `war`, `western`.

**Mood → genres** (starting values, tuned in Phase 6): cosy → `family`, `romance`, `animation` · funny → `comedy` · tense → `thriller`, `crime`, `horror` · moving → `drama`, `romance` · mind_bending → `scifi`, `mystery` · feel_good → `comedy`, `family`, `music`. Energy nudges the score only: `half_asleep` favours shorter films and `comedy`, `family`, `animation`; `wired` favours `action`, `thriller`, `adventure`.

**Sample data.** With no `MOTN_API_KEY` the Catalog reads `worker/fixtures.ts` instead of calling MOTN (local dev, tests, CI). Requests are counted the same way, so the guard behaves identically.

**Quota guard.** Before each MOTN request the Catalog checks `day:<YYYY-MM-DD>` and `month:<YYYY-MM>` (UTC). Over a cap → `QUOTA_REACHED` with the scope, and no request is sent. A 429 from MOTN is treated the same way as the monthly cap **[verify the exact status and body MOTN returns at quota]**: the Catalog stops calling for 6 hours, then lets one request through to test. MOTN's billing cycle may not match the calendar month **[verify in the dashboard]**; the counters are a guard, MOTN's own answer is the authority. Per-second rate limits on the free plan are not documented **[verify]**; settle calls run one after another.

## 8. Pick pipeline

Runs inside the room's `settle` handler, for the ready members only.

1. **Group inputs.** Union of `serviceIds`; lowest `maxMinutes` (ignoring "no limit"); union of mood genres; each member's favourites (already in room state, so no lookup).
2. **Candidates** (3 Catalog calls, about 60 films):
   - A: mood genres, `order_by=popularity_1year`, page 1.
   - B: the same query, page 2 (using `nextCursor`).
   - C: the three most common genres across all favourites, `order_by=popularity_alltime`, page 1.
3. **Hard filters** (the AI cannot override them): a `subscription` or `free` option in the room's region on a service in the union · `runtime` known and ≤ group limit + 10 · `showType === "movie"` · `releaseYear` known and not in the future · `rating` ≥ 60 · not anyone's favourite. MOTN has no adult-content flag in the documented show fields **[verify]**; the rating floor and the mainstream catalogs are the only guard.
4. **Affinity** per member, 0 to 1: `0.6·genre overlap + 0.25·people + 0.15·era`. Genre overlap = share of the film's genres found in that member's favourites, weighted by how often they appear. People = 1 for a shared director, 0.5 for a shared cast member. Era = 1 within 10 years of any favourite, 0.5 within 20.
5. **Group score:** `0.6·min + 0.4·mean` of affinities, `+ 0.15·mood fit + 0.05·energy fit + 0.05·rating/100`. Sort descending. Top 10 = candidate set `C`; the rest is `pool`.
6. **Relaxation ladder** when fewer than 3 films survive: fetch one more page of A (1 call) → allow runtime + 20 (no call) → query with no genres (1 call) → `NO_CANDIDATES`.
7. **AI rank** (section 9), or the fallback (section 10).
8. Store `result`, `phase = "result"`, broadcast.

Failures: a Catalog call fails → if at least 10 films have already survived the filters, carry on with them; otherwise back to `lobby` with `QUOTA_REACHED` or `PICK_FAILED`. After a failure no further calls are made in that settle. The ladder ends in `NO_CANDIDATES` only when nothing at all survives; one or two survivors are still a pick.

## 9. AI contract

One `POST {AI_BASE_URL}/chat/completions` with `fetch` (no SDK; `model = AI_MODEL`), temperature 0.4, `max_completion_tokens: 2000`, `reasoning_effort: "low"`, `include_reasoning: false`, no streaming, no tools. If `AI_API_KEY` is not set the step is skipped (kill switch). It is also skipped when the shortlist has fewer than 3 films. A non-2xx answer (429 included), a timeout or a network error goes straight to the fallback; only a validation failure is retried.

**Result.** The model's three films lead the ranking with its reasons; the other shortlist films follow in score order with template reasons, so a veto past the third film needs no second call.

**Deadline.** One 12 s budget covers the first attempt and its one retry. The first attempt may use up to 8 s. A retry happens only after a validation failure and only if at least 3 s remain; it gets the time that is left. When the budget is spent, the fallback is used.

**Input** (user message, JSON). Members are `P1..Pn`; the mapping to member ids stays in the room. No nicknames, no free text, no overviews, no cast.

```json
{"members":[{"member":"P1","mood":"funny","energy":"awake","maxMinutes":120,
             "favourites":[{"title":"Paddington 2","year":2017}]}],
 "candidates":[{"id":"1234","title":"Example Film","year":2019,"genres":["Comedy"],"runtime":104,
                "serviceNames":["Netflix"]}]}
```

Candidates are capped at 10; favourites at 3 per member. This is the least data that still lets the model write a reason.

**System rules:** rank exactly 3 films, using only ids from `candidates`; for each film write one reason for every member; begin with "You" or "Your"; do not repeat the film's title; at most 140 characters; use only facts present in the input; no names, no links.

**Output** via `response_format: { type: "json_schema", json_schema: { name: "ranking", strict: true, schema } }` (strict mode confirmed for this model, see [TRD §10](TRD.md#10-verified-platform-facts); every property is required and every object has `additionalProperties: false`):

```json
{"ranking":[{"id":"1234","reasons":[{"member":"P1","text":"You wanted funny and under two hours; this is both."}]}]}
```

**Validation** (zod, after parsing; the schema alone is not trusted):

| Rule | Check |
|---|---|
| Ranking length | exactly 3 |
| Ids | each in `C`, all distinct |
| Reasons | exactly one per settled member per film; `member` matches `/^P[1-8]$/` and exists |
| Text | 1 to 140 chars after trim; no control characters; no `http`, `www.`, `://` or `_` (a leaked setting name) |

Fail → one retry with the validation error appended, inside the shared deadline. A second failure, a 429, a timeout or any thrown error → fallback. Film facts shown in the UI (title, year, poster, runtime, services) always come from MOTN data held by the room, never from the model's output.

## 10. Fallback and veto

- **Fallback ranking:** `C` in score order, `source: "fallback"`. Used when the AI step fails, and when `AI_API_KEY` is not set. No error is shown.
- **Template reasons** are built from real overlap data, in this order of preference: shared director ("From the director of *{favourite}*.") → shared genre with one of the member's favourites ("Like *{favourite}*, it's a {genre}.") → mood match ("You asked for {mood}; this is that.") → practical fit ("On {service} and inside your {time}."). Favourite titles come from MOTN, not from user typing.
- **Veto:** records `{memberId, movieId}`, sets `vetoUsed`, increments `index`. If `ranking[index]` does not exist, the next film from `pool` is appended with template reasons. If `pool` is empty, `exhausted = true` and the UI shows "That's everything you can all stream." with the host's **Back to the lobby** (`reopen`). No film appears twice. A veto never calls MOTN or the AI.

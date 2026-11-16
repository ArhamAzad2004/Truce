# Truce: Decisions

Short records of the choices that shape Truce. Each one says what was decided, what else was on the table, and what it costs. New decisions go at the bottom; a reversed decision gets a new entry that points back to the old one.

Related: [`PRD.md`](PRD.md) (what and why), [`TRD.md`](TRD.md) (how), [`BACKEND_SCHEMA.md`](BACKEND_SCHEMA.md) (state and protocol), [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) (threats and data), [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) (phases).

Items marked **[verify]** rest on a provider's terms or limits and must be checked against current docs before they are relied on.

| # | Decision | Date |
|---|---|---|
| 001 | Rebuild the Python CLI as a web app | 2026-11-15 |
| 002 | Focus on the group decision | 2026-11-15 |
| 003 | No accounts | 2026-11-15 |
| 004 | Cloudflare Workers + one Durable Object per room | 2026-11-15 |
| 005 | Groq free tier through the OpenAI SDK | 2026-11-15 |
| 006 | AI only ranks a server-built shortlist; deterministic fallback (updated by 016) | 2026-11-15 |
| 007 | No user free text reaches the LLM | 2026-11-15 |
| 008 | Services as a union, one region per room | 2026-11-15 |
| 009 | One AI call per room; vetoes walk the ranked list | 2026-11-15 |
| 010 | Full-state snapshots over WebSocket | 2026-11-15 |
| 011 | Minimal dependencies | 2026-11-15 |
| 012 | All rights reserved licence | 2026-11-15 |
| 013 | Keep the old git history | 2026-11-15 |
| 014 | Design direction: Night Ticket | 2026-11-16 |
| 015 | Design-checker exceptions live in `.impeccable/config.json` | 2026-11-16 |
| 016 | Replace TMDb with the Streaming Availability API | 2026-11-16 |
| 017 | One Catalog object for all data-source calls, cache and quota guard | 2026-11-16 |
| 018 | Room protocol gaps closed | 2026-11-16 |

---

## 001. Rebuild the Python CLI as a web app
**Date:** 2026-11-15

**Context.** The first version was a single-user Python command-line prototype (`main.py` plus a committed virtualenv). It could not be shared with friends, could not run on a phone, and could not show anything visual in a portfolio.

**Decision.** Retire the prototype and rebuild Truce as a TypeScript web app that opens on any phone from a link.

**Alternatives considered.**
- *Keep Python, add a web front end (FastAPI + React).* Two languages and two deploys for one small app; see 004 for why the Python hosting options fell short.
- *Native mobile app.* App store review and install friction defeat "join from a link in five seconds".

**Consequences.** One language end to end; zod schemas shared by client and server. Nothing from the old code is reused. The old history stays (013).

## 002. Focus on the group decision
**Date:** 2026-11-15

**Context.** Single-user movie recommenders are everywhere and are not a strong portfolio story. The real pain is a group that cannot agree, scrolling for half an hour.

**Decision.** Truce does one job: a group of 2–8 people in one room gets **one** film they can all stream tonight, with a reason for each person and one veto each.

**Alternatives considered.**
- *Personal recommender with watchlists.* Crowded, needs accounts and history.
- *Swipe-to-match for groups.* Slower (many swipes per person) and ends in a list, not a decision.

**Consequences.** Success is measured by speed and fairness: under 60 s for 3 people, one pick, zero unstreamable picks (see [`PRD.md`](PRD.md)). Features that serve one person alone (history, ratings, watchlists) are out of scope.

## 003. No accounts
**Date:** 2026-11-15

**Context.** Every extra step at the door costs people. Accounts also mean passwords, emails and personal data to protect.

**Decision.** Join with a nickname only. Identity is a random 128-bit member token, held in `sessionStorage` and sent in the first socket message, never in a URL. Rooms and everything in them are deleted after 4 hours.

**Alternatives considered.**
- *Email magic link or OAuth.* Slower to join; stores personal data for no gain in a one-evening room.
- *Anonymous seats with no nickname.* Reasons and vetoes need a name to feel personal.

**Consequences.** Almost no personal data to leak. No history across nights. A new tab or device cannot reclaim a seat. Host powers are tied to a token, so a lost host token means no settle (see [`APP_FLOW.md`](APP_FLOW.md) §6). Fonts are self-hosted, so no outside font service sees visitors either.

## 004. Cloudflare Workers + one Durable Object per room
**Date:** 2026-11-15

**Context.** A room needs live presence for up to 8 phones, one authority for the state machine, and automatic deletion. It must cost $0 and must not be asleep when someone opens a link at 9 pm.

**Decision.** Cloudflare Workers (Free plan) serve the static client and the API. Each room is one Durable Object, addressed by its room code, holding the WebSockets (with hibernation) and one JSON state blob, with an alarm that deletes it after 4 hours.

**Alternatives considered.**
- *Render + FastAPI.* A free web service spins down after 15 minutes without inbound traffic and shows a loading page while it wakes (checked 2026-11-16 at https://render.com/docs/free; the length of the wake-up was not measured). The first person to open a link would wait.
- *Supabase (Realtime + Postgres).* Free projects pause after about a week of inactivity, which suits a portfolio demo badly. Room logic would sit in clients or edge functions, with no single authority. **[verify]**
- *Next.js on Vercel.* Serverless functions do not hold WebSockets open, so a separate realtime service would still be needed.

**Consequences.** No cold-start wait on a sleeping server, no database to run, and expiry comes free with the alarm. Locks Truce to Cloudflare's Durable Object model and its Free-plan limits: 50 subrequests per invocation (checked 2026-11-16; a settle uses at most 8), and rate-limit bindings whose Free-plan availability is still **[verify]** (fallback: an in-memory counter per isolate). Settling must save `phase = "settling"` before the first outbound call, because awaiting lets other messages in.

## 005. Groq free tier through the OpenAI SDK
**Date:** 2026-11-15

**Context.** The ranking step needs a fast LLM with structured JSON output, at $0.

**Decision.** Call Groq's free tier using the `openai` SDK pointed at Groq's OpenAI-compatible endpoint. Provider, model and key come from `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`, so switching provider is a config change, not a code change.

**Alternatives considered.**
- *Paid OpenAI.* Breaks the $0 rule.
- *Gemini free tier.* Usable, but free-tier terms allowed prompts to be used to improve the product, and its SDK would tie the code to one vendor. **[verify]**

**Consequences.** Low latency and no bill. Free-tier rate limits are tight, which 009 keeps well inside. Strict `json_schema` output is supported on `openai/gpt-oss-20b` (checked 2026-11-16 at https://console.groq.com/docs/structured-outputs); zod still validates every reply. Free-tier rate-limit numbers are still **[verify]**. Leaving `AI_API_KEY` unset switches the AI step off. Groq receives no personal data (007).

## 006. AI only ranks a server-built shortlist; deterministic fallback
**Date:** 2026-11-15 · **Updated:** 2026-11-16 (data source changed by 016)

**Context.** An LLM asked to "recommend a film" can invent titles, pick films nobody can stream, or ignore runtime limits. The product promise is zero unstreamable picks.

**Decision.** The server builds and filters the candidates from the film data source first (streamable in the region on a chosen service, fits everyone's time, released, not a favourite). The AI may only rank IDs from that list and write one short reason per person. Its output is validated (known IDs, one reason per member, 1–140 characters, no URLs). Any failure, after at most one retry inside one shared 12-second deadline, falls back to the deterministic score order with template reasons. The fallback is built and shipped first.

**Alternatives considered.**
- *AI picks freely, then check streamability.* Wastes calls and can still fail the check.
- *No AI at all.* Works (it is the fallback), but the personal reasons are the part people remember.

**Consequences.** The AI cannot override the hard filters or name a film outside the list. The app works with the AI switched off. The user never sees an error when the AI fails. The original data source, TMDb, turned out to bar this use; see 016. The metadata sent to the model is kept minimal: title, year, genres, runtime and service names, with no film descriptions.

## 007. No user free text sent to the LLM
**Date:** 2026-11-15

**Context.** Nicknames and search text are the only free text in Truce. Passing them to an LLM opens prompt injection and sends personal data to a third party.

**Decision.** The prompt contains only enums (mood, energy, time), film data held by the server, and members labelled `P1..P8`. The client adds nicknames back when it shows the reasons. Favourite titles are copied from the server's own film records by ID, never taken from the client.

**Alternatives considered.**
- *Send nicknames and sanitise them.* Sanitising is never complete, and gives Groq personal data for no benefit.
- *Let people type a free-text mood.* Richer, but the same injection risk and slower than taps.

**Consequences.** Prompt injection through user input is closed by design. Reasons are written in the second person and cannot use names. Reasons can only draw on what was tapped or picked, so lines like "you have an early start" are not possible (the mockup's third reason is illustrative only).

## 008. Streaming services as a union, one region per room
**Date:** 2026-11-15

**Context.** The group watches one screen. Requiring a service everyone has would empty the shortlist; mixing regions would make availability meaningless.

**Decision.** A film qualifies if it is on any member's selected service, included with the subscription or free to watch (no rent, buy or paid add-on). The room has one streaming region, defaulted from the host's connection country and changeable by the host in the lobby.

**Alternatives considered.**
- *Intersection of services.* Correct only if everyone watches on their own screen, which is not the use case.
- *Per-member regions.* Complicated, and the group is in one place.

**Consequences.** Larger, more useful shortlist. A group split across countries is not served. Services differ by country, so changing the region clears everyone's services and ready flags (018). Only countries and services the data source covers can be chosen (016).

## 009. One AI call per settle; vetoes walk a ranked list
**Date:** 2026-11-15 · **Updated:** 2026-11-16 (retries and reopen, see 018)

**Context.** Free-tier AI limits are tight, and a veto should feel instant.

**Decision.** One AI call per settle returns a ranked top 3 with per-person reasons. A veto moves to the next film in the list with no new AI call and no data-source call. Films past the top 3 are taken lazily from the score order with template reasons. When the list runs out, the room says so and the host can reopen the lobby so the group can loosen a filter. A room allows at most 5 settle attempts.

**Alternatives considered.**
- *New AI call per veto.* Up to 8 extra calls per room, slower vetoes, more 429s.
- *Ask the AI for 8–10 ranked films.* Longer prompt and output, more validation failures, little gain.

**Consequences.** About one call (plus at most one retry) per settle keeps Truce far inside the AI free tier. Runners-up after the third get plainer reasons. Vetoes never repeat a film.

## 010. Full-state snapshots over WebSocket (no diffs)
**Date:** 2026-11-15

**Context.** The public room view is small: at most 8 members, a phase, a region and one film.

**Decision.** After every change the server sends each client the whole public view. Clients replace their state; there is no patching.

**Alternatives considered.**
- *Diffs or patches.* Smaller messages, but ordering bugs, missed-message recovery and more code, for a payload of a few kilobytes.
- *A sync library (CRDT, realtime service).* Far more than a room of 8 needs.

**Consequences.** Reconnect and resume are trivial: the next snapshot fixes everything. Bandwidth is slightly higher, which does not matter at this size. The public view is the one place to check that no hidden data (answers, tokens, lower-ranked films) leaks.

## 011. Minimal dependencies
**Date:** 2026-11-15

**Context.** Every package is code to audit, update and trust. The app has six screens and one live connection.

**Decision.** Runtime dependencies are `react`, `openai`, `zod` and one zero-dependency QR library. No router, no state library, no UI kit, no Tailwind: screens switch on the room phase, state lives in one reducer, styles are plain CSS with the brand tokens.

**Alternatives considered.**
- *React Router, Zustand/Redux, a component kit, Tailwind.* Each saves a little code and adds weight, upgrades and supply-chain risk; a UI kit also pulls the look toward generic.

**Consequences.** Small bundle, small attack surface, design fully under control. Anything a library would have handled (focus management, accessible controls) is written and tested in house. A library is added only when a real need appears.

## 012. All rights reserved licence
**Date:** 2026-11-15

**Context.** Truce is a portfolio piece and a possible product. The code is public so reviewers can read it.

**Decision.** `LICENSE` is all rights reserved. No open-source licence.

**Alternatives considered.**
- *MIT or Apache-2.0.* Good for community, but lets anyone ship a copy, which is not the aim.
- *Private repo.* Hides the work from the people it is meant to show.

**Consequences.** Others may read the code (and GitHub's terms let users view and fork public repos) but may not reuse it. Outside contributions would need an explicit agreement. Can be relaxed later; tightening after an open release is much harder.

## 013. Keep the old git history
**Date:** 2026-11-15

**Context.** Early commits include a committed Python virtualenv of about 10 MiB. The history was checked and holds no secrets.

**Decision.** Keep the history as it is. Remove the old files going forward and ignore them in `.gitignore`.

**Alternatives considered.**
- *Rewrite history (filter-repo) to drop the virtualenv.* Smaller clones, but it rewrites every commit hash, breaks existing clones and old commit links, and needs a force push for a cosmetic gain.

**Consequences.** Clones carry about 10 MiB of dead weight. The repo honestly shows where the project started. If a secret is ever found in history, rotate it first; rewriting would then be reconsidered.

## 014. Design direction: Night Ticket
**Date:** 2026-11-16

**Context.** Five directions (01 Torn Stub, 02 Programme Notes, 03 House Lights, 04 Kitchen Note, 05 Signed Truce) were mocked up with the same three screens and data. After reviewing them, the owner asked for a hybrid of 01 and 03.

**Decision.** **06 Night Ticket**: 01's ticket system (perforations, notches, stub, tear-off veto, type) lit inside 03's dark auditorium (warm-black room, amber as the only light, seats in the lobby, lights-down reveal). It is now the brand book in [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md).

**Alternatives considered.**
- *01 Torn Stub alone* (the art direction's first pick). Clear metaphor, but light and calm; less sense of occasion at the reveal.
- *03 House Lights alone.* Strong mood, but no strong container for inputs, and its caption plates fight light content.
- *05 Signed Truce.* Most ownable idea, highest risk of the joke wearing thin.
- *02, 04.* Well made, less tied to the product's moment.

**Consequences.** Dark theme only for v1. The mask-cut notches must be checked in iOS Safari and Firefox. Red and bronze stay on ticket stock only. One lit object per screen limits how much each screen can show.

## 015. Design-checker exceptions recorded in `.impeccable/config.json`
**Date:** 2026-11-16

**Context.** The automated design checker flagged some patterns in the mockups that are intended or are false positives.

**Decision.** Fix real issues. Record each confirmed false positive in `.impeccable/config.json`, scoped to the narrowest file glob, with a reason. Current entries:

| Rule | Scope | Reason |
|---|---|---|
| `low-contrast` | `01-torn-stub/**` | Notch gradients over navy; the real text pair is cream on navy, 15.2:1 |
| `gray-on-color` | `05-signed-truce/**` | Green-tinted muted text at 6.8:1, part of that direction's spec |
| `cramped-padding` | `design/mockups/**` | Hairline-divided rows with centred text in fixed-height rows; exploratory mockups only |
| `radial-halo` | `06-night-ticket/**` | The lantern in the poster placeholder and the house-light glow the owner asked for |

**Alternatives considered.**
- *Disable the rules globally.* Hides real problems in the app later.
- *Leave the warnings.* Noise trains everyone to ignore the checker.

**Consequences.** Exceptions are visible and reviewable in one file. The `cramped-padding` and `radial-halo` exceptions cover mockups only; when the app is built in `src/`, it is checked fresh and needs its own entries if any.

## 016. Replace TMDb with the Streaming Availability API
**Date:** 2026-11-16

**Context.** Truce was planned on TMDb for film data and JustWatch availability through TMDb. A read of TMDb's API terms (sections 1.C and 2.A) found two problems. The terms bar using TMDb data "in connection with" machine-learning or AI applications, and they treat use in language-model question-and-answer systems as commercial use that needs a paid agreement. There is no exception for non-commercial projects or for one-off inference. Truce's AI ranking step sends film titles and genres to a model, so it falls inside both clauses. The owner decided to keep the AI step and change the data source.

**Decision.** Use the **Streaming Availability API by Movie of the Night** (MOTN) for film data, posters and per-country streaming availability. Its terms (checked 2026-11-16) allow commercial and consumer use on the free plan and allow caching. They bar using the data to train, fine-tune, evaluate or improve AI systems, which Truce does not do; sending a shortlist to a model to rank once is not barred. Truce still sends the model the minimum (title, year, genres, runtime, service names) and never film descriptions.

**Alternatives considered.**
- *Keep TMDb, drop the AI step, and ask TMDb for written permission.* Legal today, and the deterministic pick works alone. But the per-person reasons are the heart of the product, and an answer might never come.
- *Watchmode.* Has a free tier for non-commercial use. Its terms on AI use were not established, so it could repeat the same problem.
- *Wikidata.* CC0, so no terms risk at all. But it has no per-country streaming availability, which is the hard rule Truce is built on.

**Consequences.**
- **Quota.** The free plan gives 1,000 requests and 1 GB of image bandwidth a month, with access paused at the limit and no overage charges. The pipeline was redesigned around it: about 25 requests per room, about 38 rooms a month, a shared cache, a daily soft cap and a "Truce is resting" state (017, [`TRD.md`](TRD.md) §3).
- **Single-provider risk.** MOTN is run by one person in Germany. It could change, raise prices or close. All MOTN code sits in one module so a swap is contained.
- **Attribution.** Where streaming information and images are shown, Truce must state that they are provided by Streaming Availability API by Movie of the Night, with a link to https://www.movieofthenight.com/about/api. It lives in the about sheet, with a short credit on the landing page and every reveal. The TMDB logo and JustWatch credit are gone.
- **Third-party content.** MOTN grants no licence to posters, service names and logos, or descriptions. Truce shows small posters only to identify a film, names services in text, uses no logos, and drops descriptions at the server. Removal on request.
- **Coverage.** 65 countries and a fixed list of services in each. The UAE is covered (`ae`) with Netflix, Prime Video, Apple TV, Mubi, Curiosity Stream, Crunchyroll and Zee5 according to the docs page; regional services such as Shahid, OSN+ and StarzPlay, and Disney+, are not listed. Confirm with a live call **[verify]**.
- **Data shape.** Film and service ids are strings. There is no runtime filter (checked after fetch), no keyword list and no adult flag in the documented fields **[verify]**. Affinity now uses genres, directors, cast and release year. 006, 007, 008 and 009 are updated to match.
- **No longer a constraint.** The non-commercial limit that came with TMDb is gone. Truce still has no ads or revenue in v1 by choice.

## 017. One Catalog object for all data-source calls, cache and quota guard
**Date:** 2026-11-16

**Context.** With 1,000 MOTN requests a month, every repeated lookup matters, and one busy or abusive day could use the whole month. A cache and a counter are only useful if every part of the app shares them. The Workers Cache API is per data centre, and its calls count against the 50-subrequest limit.

**Decision.** A single Durable Object, `Catalog`, is the only code that calls MOTN. It stores trimmed responses in its own storage (countries and services 7 days, title searches and film records 30 days, candidate pages 24 hours) and keeps a daily and a monthly request counter. It refuses to call MOTN past 120 requests a day (search stops at 100) or 950 a month, and after an upstream 429 it pauses for 6 hours. Choosing a favourite reads the cache only, so it never costs a request.

**Alternatives considered.**
- *Workers Cache API in the Worker.* No new object, but per-location misses, no counter, and it shares the subrequest quota.
- *Workers KV.* Global, but counters in KV can be raced, and it is one more product to configure.
- *No guard, rely on MOTN's 429.* Simplest. One bad day ends the month.

**Consequences.** Exact, global counting and caching with no new product. All requests for film data pass through one object; that is fine at this volume and would be the first thing to split if Truce grew. The cache holds search strings and film data only, with no link to a room or person ([`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) §2). MOTN's billing cycle may not be the calendar month, so the counter is a guard and MOTN's own answer is the authority **[verify]**.

## 018. Room protocol gaps closed
**Date:** 2026-11-16

**Context.** Writing the flow and the schema showed several undefined cases: how the host gets a nickname, what happens after a failed settle or an exhausted veto list, late joins, region changes, and edits after ready.

**Decision.**
- The host joins with `join {nickname, hostToken}`; the token from `POST /api/rooms` claims the host seat.
- One settle **at a time**, not one per room. A failed settle (`NO_CANDIDATES`, `PICK_FAILED`, `QUOTA_REACHED`) returns the room to `lobby` with a message. At most 5 attempts per room.
- After a result the host can send `reopen`: back to `lobby`, keeping members, answers and favourites, clearing ready flags and vetoes.
- Joining is lobby-only. Changing the region clears everyone's services and ready flags. Editing answers or favourites clears that member's ready flag. Ready needs answers and 1 to 3 favourites (the UI asks for 3).
- `closed` is a transient phase set by the expiry alarm just before storage is deleted.
- The AI attempt and its one retry share one deadline of about 12 seconds.
- Fonts are self-hosted, so the content security policy allows only the app's own origin plus MOTN's image host.

**Alternatives considered.**
- *A separate "create host" call.* One more endpoint for something `join` already does.
- *Unlimited settle retries.* Each attempt can cost data and AI quota.
- *Hotlinked Google Fonts.* Less setup, but a third party would see every visitor and the policy would need two more hosts.

**Consequences.** No dead-end screens: every failure leads back to the lobby with a next step. Error codes now include `VETO_USED`, `NO_CANDIDATES`, `PICK_FAILED` and `QUOTA_REACHED`. The 5-attempt cap is a starting value.

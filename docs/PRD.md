# Truce — Product Requirements (PRD)

Solo portfolio project. A group movie picker: one room, a few taps each, one film everyone can stream, with a reason for each person. Stack: TypeScript, React + Vite, Cloudflare Workers + Durable Objects, the Streaming Availability API by Movie of the Night for film and streaming data, an LLM through the OpenAI SDK (Groq free tier). Running cost must stay at $0.

Related docs: [TRD](TRD.md) · [Backend schema](BACKEND_SCHEMA.md) · [Security and privacy](SECURITY_PRIVACY.md) · [Design brief](DESIGN_BRIEF.md) · [App flow](APP_FLOW.md) · [Decisions](DECISIONS.md) · [Implementation plan](IMPLEMENTATION_PLAN.md)

## 1. Problem

Choosing a film as a group takes longer than it should. Everyone scrolls a different app, tastes differ, half the suggestions are not on a service anyone has, and the loudest person usually wins. Twenty minutes later the group settles for something nobody chose.

Truce ends the argument in about a minute. Each person joins from a link or QR code with only a nickname, answers four taps and names three films they love. Truce returns **one** film the group can stream tonight in their region, tells each person why it fits them, and gives each person one veto.

## 2. Users and moments

| User | Moment | What they need |
|---|---|---|
| Host | Friends or family on the sofa, TV on, nobody agrees | Open a room in one tap, share it, press "Settle it" |
| Guest | Handed a QR code or link on their own phone | Join in seconds: no account, no app install, private answers |
| Couple | Two people, two tastes, one evening | A fair pick that neither person "chose" |
| Remote group | Watch party over a call | The same room and the same reveal on every screen |

Group size: 2 to 8. One shared screen is assumed, so a film counts as streamable if **any** member has the service.

## 3. Competitor scan

Desk scan of group movie pickers (NxtUp, Movie Night, Wecide, SlateCinema, Cinetic). Their feature sets were not re-tested for this document; the comparison is about the shared model, not each app's details.

| | Swipe-match apps | Truce |
|---|---|---|
| Core model | Everyone swipes through dozens of titles until a match appears | Four taps + three favourites, then one answer |
| Time to a decision | Open-ended; depends on how long people swipe | About 60 seconds for three people |
| Output | A list of matches, or the first match | Exactly one pick, with a ranked runner-up behind each veto |
| Explanation | Usually none | One short reason per person |
| Streamable where you are | Varies | Hard rule: included with a subscription (or free) in the room's region, on a service someone has |
| Disagreement | Keep swiping | One veto each, then the next pick |
| Sign-up | Often an account or app install | Nickname only, in the browser |

**Truce's edge:** it removes the browsing. The group states what it is in the mood for once, and gets a decision rather than another list.

## 4. User stories

1. As a host, I open a room and share a link or QR code so everyone can join from their own phone.
2. As a guest, I join with just a nickname so I do not have to make an account.
3. As a member, I pick mood, energy, time and services in four taps, and nobody else sees my answers.
4. As a member, I name three films I love so the pick reflects my taste.
5. As a host, I see who is ready and press "Settle it" once at least two people are.
6. As a group, we see one film we can stream tonight, with a reason for each of us.
7. As a member, I can veto once and see the runner-up.
8. As a host, I can change the room's region in the lobby if the guess is wrong.
9. As a member, I can refresh or lose signal and come back as the same person.
10. As anyone, I can read in plain words what data is used and when it is deleted.
11. As a host, I can go back to the lobby after a result, so the group can loosen a filter and settle again.

## 5. MVP scope

**In**
- Rooms with a 10-character code, link, QR code and Web Share.
- Nickname join, live presence, ready states.
- Quick taps: mood (6), energy (3), time (4), services (multi-select, region-specific).
- Favourites search, three films per person.
- Deterministic pick: candidates, hard filters, scoring, template reasons. Always available.
- AI ranking of the shortlist with per-person reasons, validated, with silent fallback.
- One veto per member; no film repeats. The host can reopen the lobby after a result.
- Edge states: reconnect, host leaves, no candidates, expired room, data quota reached ("Truce is resting").
- Night Ticket design, reduced-motion support, WCAG AA.
- About sheet with privacy notice and the data-source attribution.

**Out (v1)**
- Accounts, profiles, history between sessions.
- TV series; rent or buy availability; cinema listings.
- Chat, reactions, comments.
- Native apps, push notifications.
- Analytics, ads, affiliate links, any monetisation.
- Light theme; languages other than English.

## 6. Success criteria (v1.0)

| # | Criterion | How it is measured |
|---|---|---|
| 1 | Median time from room created to reveal is under 60 s with 3 people | Timed runs on three phones in Phase 10 (at least 5 runs) |
| 2 | Every settle ends with exactly one pick on screen | Integration tests + manual runs; never a list, never an empty reveal |
| 3 | Zero unstreamable picks | Hard filter is tested with fixtures; spot checks by opening the film on the named service in the region |
| 4 | $0 per month | Cloudflare, Groq and data-source dashboards show no charges at launch and after a week |
| 5 | Every member gets a reason and a veto | Validation rule + tests |
| 6 | Works on iOS Safari and Android Chrome | Manual pass in Phase 10 |

## 7. Non-goals

- Not a recommendation feed or a watchlist. Truce answers one question per room.
- Not a social network. No identity beyond a nickname that lasts four hours.
- Not a business in v1. No revenue, ads or affiliate links. (The data source's terms would allow commercial use; this is a product choice.)
- Not a high-traffic app. The free data plan supports about 38 rooms a month; past that Truce rests until the next cycle.
- Not a general chatbot. Users never type free text that reaches a model.

## 8. Constraints

| Constraint | Effect on the product |
|---|---|
| Data source free plan: 1,000 requests a month | About 25 requests per room, so about 38 rooms a month. Shared cache, daily soft cap, and a friendly "Truce is resting" state at the limit. See [TRD budget](TRD.md#3-free-tier-budget). |
| Data source terms: no training, fine-tuning or evaluating AI with the data | The AI step only ranks a shortlist once (inference) and gets the minimum: title, year, genres, runtime, service names. No film descriptions. Details in [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md#9-third-party-terms). |
| Data source terms: attribution; posters, service names and logos are third-party content | Attribution sentence with link in the about sheet, short credit on landing and reveal. Posters only to identify a film; services as text, never logos. |
| The data source covers 65 countries and a fixed list of services per country | The region picker offers only supported countries. Local services may be missing (for the UAE: no Shahid, OSN+, StarzPlay or Disney+ in the documented list). |
| Free tiers only (Cloudflare Workers Free, Groq free) | Fixed budget per settle, one AI call per settle, rate limits. |
| No accounts | Identity is a random token in `sessionStorage`; rooms expire after 4 hours. |
| Solo builder | Small working slices; skip anything without a real need (router, state library, UI kit, SQL schema). |

## 9. Risks (product level)

| Risk | Mitigation |
|---|---|
| The pick feels wrong and the group loses trust | Per-person reasons, one veto each, hard filters the AI cannot override |
| Sparse catalogue in the region, or the group's services are not covered | Relaxation ladder (one more page, runtime, then mood genres); host can change region or reopen the lobby |
| Availability data is out of date | Candidate pages are cached no longer than 24 h; attribution points to the source |
| Name collision on "Truce" | Check app stores and trademark databases before publicising |
| The month's data quota runs out | Cache, daily soft cap, resting state; nothing is billed. A paid plan is the upgrade path if Truce gets real use |
| The data source closes or changes (it is run by one person) | All of its calls and shapes sit in one module, so a replacement is contained. The earlier source is ruled out by its AI terms ([DECISIONS.md 016](DECISIONS.md)) |
| A rights holder objects to a poster | Posters identify films only; remove on request |

## 10. Future ideas

- **Letterboxd import:** paste a profile or list instead of typing three favourites.
- **Screenshot taste:** read a streaming-app "continue watching" screenshot to seed favourites.
- **Fairness memory:** remember (on the device only) whose taste won last time and tilt the next pick.
- **PWA:** installable, with offline shell and share-target support.
- Series and "rent tonight" modes; more languages.
- **Open in app:** a link from the pick straight to the film on its service (the data source provides deep links).

# Truce — group movie picker (portfolio project)

A group can't agree on a movie. Each person joins a room from a link or QR code with only a nickname, answers a few taps and picks 3 favourite films. Truce returns ONE film everyone can stream in their region, with a short reason for each person, and each person gets one veto. Plan and requirements live in `docs/`; keep them in step with the code when behaviour changes.

## Rules
- Never credit Claude or AI as an author: no `Co-Authored-By` trailer or "Generated with" line in commits or PRs, and no AI mentions in commit messages, PR descriptions, code, comments or product docs. Only the Claude Code setup files (`CLAUDE.md`, `.claude/`, `.mcp.json`, `docs/SETUP.md`) and the internal `docs/IMPLEMENTATION_PLAN.md` may name the tooling. Commit messages are short and plain.
- Must stay $0: Cloudflare Workers Free, Groq free tier, Streaming Availability API free plan (1,000 requests/month). Don't add anything that needs a paid plan. Never use TMDb: its terms forbid use with AI apps.
- Secrets live only in `.dev.vars` (local, gitignored) and `wrangler secret put` (production). Never read, print or commit them.
- No user free text ever goes to the LLM: members are `P1..Pn`, inputs are enums or show IDs. The AI may only rank IDs from the shortlist; its output is validated and a deterministic fallback always exists. Never send show descriptions to the LLM, and never use API data to train or evaluate models (Streaming Availability API terms).
- Privacy: no accounts, no analytics, no logging of nicknames or tokens; rooms delete themselves after 4 hours. Fonts are self-hosted.
- Attribution must stay visible with a link to https://www.movieofthenight.com/about/api (see `docs/DESIGN_BRIEF.md` §09). Posters are for identification only; streaming services appear as text, never logos.
- Guard the 1,000 requests/month quota: cache what the terms allow, and show a friendly resting state at quota instead of failing.
- Doc-sync: a change to the WS protocol, room state, endpoints, limits or flow updates `docs/BACKEND_SCHEMA.md` or `docs/APP_FLOW.md` in the same commit.
- Small, working slices beat breadth. Windows machine: PowerShell and Git Bash both available.

## Run
- `npm i`, then `npm run dev` (Vite + Worker + Durable Object together via `@cloudflare/vite-plugin`), `npm test` (Vitest + workers pool), `npx wrangler deploy`.
- Setup for a fresh machine, keys and global vs project Claude config: `docs/SETUP.md`.

## Code map (rooms built; `catalog`, `motn`, `pick/` and later screens are planned)
- `shared/` — zod schemas for WS messages, API bodies and enums (`protocol.ts`), limits (`limits.ts`). Single source of truth for `docs/BACKEND_SCHEMA.md`.
- `worker/index.ts` — routing, rate limits, Origin check. `worker/room.ts` — Room Durable Object (state machine, hibernation, alarm expiry). `worker/motn.ts` — Streaming Availability API client, called only from the `Catalog` Durable Object (single caller: cache + daily/monthly quota counters). Local dev uses `MOTN_MODE=fixtures` so typing doesn't spend quota. `worker/pick/` — candidates → score → AI → validate → fallback.
- `src/` — React client: `useRoom.ts` (WS + reducer), `screens/` (Landing, Lobby, QuickTaps, Favourites, Settling, Reveal), `styles/tokens.css` from `docs/DESIGN_BRIEF.md`.

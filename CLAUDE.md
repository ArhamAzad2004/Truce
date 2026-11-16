# Truce — group movie picker (portfolio project)

A group can't agree on a movie. Each person joins a room from a link or QR code with only a nickname, answers a few taps and picks 3 favourite films. Truce returns ONE film everyone can stream in their region, with a short reason for each person, and each person gets one veto. Plan and requirements live in `docs/`; keep them in step with the code when behaviour changes.

## Rules
- Never mention Claude, Claude Code or AI assistance in commits, PR descriptions, code, comments or docs. No `Co-Authored-By` trailer, no "Generated with" line. Commit messages are short and plain.
- Must stay $0: Cloudflare Workers Free, Groq free tier, TMDb free non-commercial API. Don't add anything that needs a paid plan.
- Secrets live only in `.dev.vars` (local, gitignored) and `wrangler secret put` (production). Never read, print or commit them.
- No user free text ever goes to the LLM: members are `P1..Pn`, inputs are enums or TMDb IDs. The AI may only rank IDs from the TMDb shortlist; its output is validated and a deterministic fallback always exists.
- Privacy: no accounts, no analytics, no logging of nicknames or tokens; rooms delete themselves after 4 hours.
- TMDb and JustWatch attribution must stay visible (footer + about sheet). No ads or monetisation (TMDb non-commercial terms).
- Doc-sync: a change to the WS protocol, room state, endpoints, limits or flow updates `docs/BACKEND_SCHEMA.md` or `docs/APP_FLOW.md` in the same commit.
- Small, working slices beat breadth. Windows machine: PowerShell and Git Bash both available.

## Run
- Not scaffolded yet (Phase 3 in `docs/IMPLEMENTATION_PLAN.md`). Planned: `npm i`, then `npm run dev` (Vite + Worker + Durable Object together via `@cloudflare/vite-plugin`), `npm test` (Vitest + workers pool), `npx wrangler deploy`.
- Setup for a fresh machine, keys and global vs project Claude config: `docs/SETUP.md`.

## Code map (planned)
- `shared/` — zod schemas for WS messages, API bodies and enums (`protocol.ts`), limits (`limits.ts`). Single source of truth for `docs/BACKEND_SCHEMA.md`.
- `worker/index.ts` — routing, rate limits, Origin check. `worker/room.ts` — Room Durable Object (state machine, hibernation, alarm expiry). `worker/tmdb.ts` — TMDb client. `worker/pick/` — candidates → score → AI → validate → fallback.
- `src/` — React client: `useRoom.ts` (WS + reducer), `screens/` (Landing, Lobby, QuickTaps, Favourites, Settling, Reveal), `styles/tokens.css` from `docs/DESIGN_BRIEF.md`.

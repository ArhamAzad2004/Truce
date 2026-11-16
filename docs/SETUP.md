# Setup

How to get Truce running on a fresh machine, and how the Claude Code setup is split.

## 1. Tools
- Node.js LTS and npm.
- Git and the GitHub CLI (`gh auth login`).
- A free Cloudflare account, then `npx wrangler login` once the project is scaffolded.

## 2. API keys (both free)
| Key | Where to get it | Notes |
|---|---|---|
| `MOTN_API_KEY` | developers.movieofthenight.com → sign up → copy the key from the dashboard | Streaming Availability API by Movie of the Night. Free plan, no card: 1,000 requests and 1 GB of images a month, paused at the limit. Use one account only. Credit it in the app (see `DESIGN_BRIEF.md` 09). Get the key from this site, not from RapidAPI (different URL and header). |
| `AI_API_KEY` | console.groq.com → API Keys | Free tier, rate-limited. Leave it empty to switch the AI step off. |

Put them in `.dev.vars` in the project root (gitignored, never committed). Every line is optional:

```
MOTN_API_KEY=
AI_API_KEY=
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b
```

With no `MOTN_API_KEY` set, the Catalog answers from hand-written sample data (`worker/fixtures.ts`), so local runs, tests and CI never spend the 1,000 monthly requests. Add the key to `.dev.vars` only when you need real data. Production must have the key, or the live site shows the sample films.

Switching to paid OpenAI later is config-only: change `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`.

Production uses `npx wrangler secret put <NAME>` for each secret, never `.dev.vars`.

## 3. Claude Code: global vs project

**Global** (`~/.claude/`) is your personal toolbox. It applies to every project on one computer and is not in this repo. Truce relies on these global skills being installed:
- `impeccable`, `frontend-design`, `no-ai-design-slop`, `audit-reference-originality`: design work and reviews.
- `agent-skills` (code review, security, testing), `ponytail`: engineering workflow.
- Your global `CLAUDE.md` holds personal preferences (commit style, privacy).

**Project** (committed here) travels with the repo, so a fresh clone behaves the same everywhere:
- `CLAUDE.md`: Truce rules, run commands, code map.
- `.claude/settings.json`: allowed, ask-first and denied commands. Secrets files are denied for reading, and deploys, pushes and installs ask first.
- `.mcp.json`: the Cloudflare docs MCP server (`https://docs.mcp.cloudflare.com/mcp`), so Claude reads current Workers and Durable Objects docs instead of guessing.

Never put API keys in either place. Personal overrides go in `.claude/settings.local.json`, which is gitignored and not shared.

On a new machine: install the global skills, clone the repo, open it in Claude Code, and approve the project MCP server when asked.

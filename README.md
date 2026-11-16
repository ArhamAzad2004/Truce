# Truce

**Movie night, settled.** Everyone joins from their phone, taps a few answers and names 3 films they love. Truce picks the one film the whole group can stream tonight, and tells each person why it fits them.

> Work in progress. The old Python prototype has been retired; the rebuild plan is in [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## How it will work
1. The host opens a room and shares a link or QR code.
2. Each person joins with a nickname (no account), picks their mood, time and streaming services, and 3 favourite films.
3. Truce shortlists films that are streamable in your region and fit everyone's time, ranks them, and reveals one pick with a reason for each person.
4. Everyone has one veto that reveals the runner-up.

## Stack
TypeScript, React + Vite, Cloudflare Workers and Durable Objects (one live room per group), TMDb for film data, and an LLM through the OpenAI SDK (Groq free tier). See [`docs/SETUP.md`](docs/SETUP.md).

## Attribution
This product uses TMDB and the TMDB APIs but is not endorsed or certified by TMDB. Streaming availability data by JustWatch.

## Licence
All rights reserved. See [`LICENSE`](LICENSE).

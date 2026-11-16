import { CODE_ALPHABET, CODE_RE, LIMITS, cleanQuery } from "../shared/limits";
import type { CreateRoomResponse } from "../shared/protocol";
import type { Fail } from "./catalog";
import { newToken } from "./room";

export { Room } from "./room";
export { Catalog } from "./catalog";

const json = (body: unknown, status = 200, cache = "no-store") =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });

const LISTING_CACHE = "public, max-age=3600"; // lists that are the same for everyone

const failed = (fail: Fail) =>
  fail.error === "QUOTA_REACHED" ? json({ error: fail.error, scope: fail.scope }, 503) : json({ error: "UPSTREAM" }, 502);

// 10 chars x 5 bits = 50 bits; 256 % 32 === 0, so the modulo is unbiased.
const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_ALPHABET[b % 32]).join("");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/health") {
      if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      return json({ ok: true });
    }

    // Only Truce's own pages may call the API from a browser. Without this, any website could make its
    // visitors' browsers run searches or open rooms, spending their budgets and the shared allowance.
    // Browsers always send these headers; tools that omit them are covered by the per-address limits.
    const site = request.headers.get("Sec-Fetch-Site");
    const origin = request.headers.get("Origin");
    if ((site !== null && site !== "same-origin") || (origin !== null && origin !== url.origin)) {
      return json({ error: "FORBIDDEN_ORIGIN" }, 403);
    }

    const catalog = env.CATALOG.getByName("catalog");
    // Cloudflare sets CF-Connecting-IP on every real request and overwrites any value a client sends.
    // It is only absent in tests and local tools, where there is nothing to limit.
    const client = request.headers.get("CF-Connecting-IP");
    const limited = async (bucket: keyof typeof LIMITS.rate) =>
      client !== null && !(await catalog.allow(bucket, client));

    if (pathname === "/api/regions" || pathname === "/api/services" || pathname === "/api/search") {
      if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      if (await limited("listings")) return json({ error: "RATE_LIMITED" }, 429);
      if (pathname === "/api/search") {
        const raw = url.searchParams.get("q") ?? "";
        // Length is checked after normalising: some single characters expand to many under NFKC.
        const q = raw.length <= 200 ? cleanQuery(raw) : "";
        if (q.length < LIMITS.searchMin || q.length > LIMITS.searchMax) return json({ error: "BAD_REQUEST" }, 400);
        const found = await catalog.search(q, client);
        return found.ok ? json(found.data, 200, LISTING_CACHE) : failed(found);
      }
      const countries = await catalog.countries();
      if (!countries.ok) return failed(countries);
      if (pathname === "/api/regions") {
        const regions = Object.entries(countries.data).map(([code, c]) => ({ code, name: c.name }));
        return json(regions.sort((a, b) => a.name.localeCompare(b.name)), 200, LISTING_CACHE);
      }
      const region = url.searchParams.get("region") ?? "";
      if (!/^[A-Z]{2}$/.test(region)) return json({ error: "BAD_REQUEST" }, 400);
      return json(countries.data[region]?.services ?? [], 200, LISTING_CACHE);
    }

    if (pathname === "/api/rooms") {
      if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      if ((await limited("rooms")) || (await limited("roomsDay"))) return json({ error: "RATE_LIMITED" }, 429);
      // Nobody should open a room that cannot finish.
      const { resting } = await catalog.status();
      if (resting) return json({ error: "QUOTA_REACHED", scope: resting }, 503);
      const countries = await catalog.countries();
      const country = request.cf?.country;
      const region = typeof country === "string" && countries.ok && countries.data[country] ? country : "US";
      for (let tries = 0; tries < 3; tries++) {
        const code = newCode();
        const hostToken = newToken();
        if (await env.ROOM.getByName(code).create(code, region, hostToken)) {
          return json({ code, hostToken } satisfies CreateRoomResponse);
        }
      }
      return json({ error: "INTERNAL" }, 500);
    }

    const ws = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (ws) {
      if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      if (!CODE_RE.test(ws[1])) return json({ error: "BAD_REQUEST" }, 400);
      const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
      // Browsers always send Origin on a WebSocket handshake; only this app's own pages may connect.
      if (upgrade && origin !== url.origin) return json({ error: "FORBIDDEN_ORIGIN" }, 403); // and it must be present
      if (await limited("sockets")) return json({ error: "RATE_LIMITED" }, 429);
      return env.ROOM.getByName(ws[1]).fetch(request);
    }

    return json({ error: "NOT_FOUND" }, 404);
  },
} satisfies ExportedHandler<Env>;

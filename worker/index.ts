import { CODE_ALPHABET, CODE_RE, LIMITS } from "../shared/limits";
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

    const catalog = env.CATALOG.getByName("catalog");

    if (pathname === "/api/regions" || pathname === "/api/services" || pathname === "/api/search") {
      if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      if (pathname === "/api/search") {
        const q = (url.searchParams.get("q") ?? "").trim();
        if (q.length < LIMITS.searchMin || q.length > LIMITS.searchMax) return json({ error: "BAD_REQUEST" }, 400);
        const found = await catalog.search(q);
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
      if (upgrade && request.headers.get("Origin") !== url.origin) return json({ error: "FORBIDDEN_ORIGIN" }, 403);
      return env.ROOM.getByName(ws[1]).fetch(request);
    }

    return json({ error: "NOT_FOUND" }, 404);
  },
} satisfies ExportedHandler<Env>;

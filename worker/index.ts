import { CODE_ALPHABET, CODE_RE } from "../shared/limits";
import type { CreateRoomResponse } from "../shared/protocol";
import { newToken } from "./room";

export { Room } from "./room";
export { Catalog } from "./catalog";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

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

    if (pathname === "/api/rooms") {
      if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      // shortcut: region is not checked against the countries the listings cover; the Catalog does that in Phase 5.
      const country = request.cf?.country;
      const region = typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : "US";
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

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { FilmRow, Region, Service } from "../shared/protocol";
import { parseCountries, parseShows } from "../worker/motn";
import { clientKey } from "../worker/catalog";
import { BASE, createRoom, join } from "./helpers";

const get = (path: string) => exports.default.fetch(`${BASE}${path}`);
const answers = { type: "setAnswers", mood: "funny", energy: "awake", maxMinutes: 120, serviceIds: ["netflix"] };

/** Runs a search so the Catalog knows these films, and returns their ids. */
async function search(q: string) {
  const res = await get(`/api/search?q=${encodeURIComponent(q)}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as FilmRow[]).map((f) => f.id);
}

describe("film listings", () => {
  it("lists regions and a region's services", async () => {
    const regions = (await (await get("/api/regions")).json()) as Region[];
    expect(regions.map((r) => r.code)).toContain("AE");
    const services = (await (await get("/api/services?region=AE")).json()) as Service[];
    expect(services[0]).toEqual({ id: "netflix", name: "Netflix" });
    expect(await (await get("/api/services?region=ZZ")).json()).toEqual([]);
    expect((await get("/api/services?region=ae")).status).toBe(400);
  });

  it("searches films, validates the query and returns trimmed rows", async () => {
    const res = await get("/api/search?q=godfather");
    const rows = (await res.json()) as FilmRow[];
    expect(rows.map((r) => r.title)).toEqual(["The Godfather", "The Godfather Part II"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "poster", "title", "year"]);
    expect((await get("/api/search?q=go")).status).toBe(400);
    expect((await get(`/api/search?q=${"x".repeat(61)}`)).status).toBe(400);
  });

  it("serves repeats from the cache and rests at the daily cap", async () => {
    const catalog = env.CATALOG.getByName("catalog");
    const day = `day:${new Date().toISOString().slice(0, 10)}`;
    const count = () => runInDurableObject(catalog, (_c, state) => state.storage.kv.get<number>(day) ?? 0);

    await search("totoro");
    const before = await count();
    await search("  TOTORO ");
    expect(await count()).toBe(before); // same query after normalising: no new request

    await runInDurableObject(catalog, (_c, state) => state.storage.kv.put(day, 100));
    try {
      const res = await get("/api/search?q=whiplash");
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "QUOTA_REACHED", scope: "day" });
      expect((await get("/api/search?q=totoro")).status).toBe(200); // cached answers still work
      expect((await exports.default.fetch(`${BASE}/api/rooms`, { method: "POST" })).status).toBe(503);
    } finally {
      await runInDurableObject(catalog, (_c, state) => state.storage.kv.put(day, before));
    }
  });

  it("keeps only the fields Truce uses from an API response", () => {
    const films = parseShows([
      {
        id: "82", title: "The\u0000 Godfather", showType: "movie", releaseYear: 1972, overview: "must be dropped",
        genres: [{ id: "crime", name: "Crime" }], directors: ["Francis Ford Coppola"], cast: ["a", "b", "c", "d", "e", "f"],
        imageSet: { verticalPoster: { w240: "https://cdn.movieofthenight.com/show/82/poster.jpg?Expires=1" } },
      },
      { id: "83", title: "A Series", showType: "series" },
      { id: "84", title: "Bad poster host", showType: "movie", imageSet: { verticalPoster: { w240: "https://evil.example/x.jpg" } } },
      { title: "no id" },
    ]);
    expect(films).toEqual([
      { id: "82", title: "The Godfather", year: 1972, poster: "https://cdn.movieofthenight.com/show/82/poster.jpg?Expires=1",
        genres: ["crime"], directors: ["Francis Ford Coppola"], cast: ["a", "b", "c", "d", "e"] },
      { id: "84", title: "Bad poster host", year: null, poster: null, genres: [], directors: [], cast: [] },
    ]);
    expect(parseCountries({
      ae: { name: "United Arab Emirates", services: [
        { id: "netflix", name: "Netflix", streamingOptionTypes: { subscription: true } },
        { id: "rentonly", name: "Rent Only", streamingOptionTypes: { rent: true } },
      ] },
    })).toEqual({ AE: { name: "United Arab Emirates", services: [{ id: "netflix", name: "Netflix" }] } });
  });
});

describe("rate limits", () => {
  it("limits each client address separately, per kind of request", async () => {
    const from = (ip: string, path: string, init: RequestInit = {}) =>
      exports.default.fetch(`${BASE}${path}`, { ...init, headers: { "CF-Connecting-IP": ip } });
    const statuses = async (ip: string, path: string, times: number, init?: RequestInit) => {
      const out: number[] = [];
      for (let i = 0; i < times; i++) out.push((await from(ip, path, init)).status);
      return out;
    };
    expect(await statuses("203.0.113.1", "/api/rooms", 6, { method: "POST" })).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await from("203.0.113.2", "/api/rooms", { method: "POST" })).status).toBe(200); // someone else is unaffected
    expect((await from("203.0.113.1", "/api/regions")).status).toBe(200); // a different bucket
    expect((await statuses("203.0.113.3", "/api/regions", 31)).at(-1)).toBe(429);
    expect(await (await from("203.0.113.3", "/api/search?q=totoro")).json()).toEqual({ error: "RATE_LIMITED" });
    expect((await statuses("203.0.113.4", "/api/rooms/0000000000/ws", 21)).slice(-2)).toEqual([404, 429]);
  });

  it("gives each client a daily budget of new searches, so one person can't drain the shared allowance", async () => {
    const from = (ip: string, q: string) => exports.default.fetch(`${BASE}/api/search?q=${q}`, { headers: { "CF-Connecting-IP": ip } });
    await from("203.0.113.9", "totoro"); // someone else caches this one
    const statuses: number[] = [];
    for (let i = 0; i < 26; i++) statuses.push((await from("2001:db8:1:2::" + i, `budget query ${i}`)).status); // one /64, many addresses
    expect(statuses.slice(0, 25).every((s) => s === 200)).toBe(true);
    expect(statuses[25]).toBe(503);
    expect((await from("2001:db8:1:2::99", "totoro")).status).toBe(200); // cached answers stay free
    expect((await from("2001:db8:9:9::1", "budget query fresh")).status).toBe(200); // another network is unaffected
  });

  it("refuses API calls made by other websites", async () => {
    const cross = { headers: { "Sec-Fetch-Site": "cross-site" } };
    expect((await exports.default.fetch(`${BASE}/api/search?q=totoro`, cross)).status).toBe(403);
    expect((await exports.default.fetch(`${BASE}/api/rooms`, { method: "POST", ...cross })).status).toBe(403);
    expect((await exports.default.fetch(`${BASE}/api/rooms`, { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await exports.default.fetch(`${BASE}/api/regions`, { headers: { "Sec-Fetch-Site": "same-origin", Origin: BASE } })).status).toBe(200);
  });

  it("counts IPv6 networks by their /64, however the address is written", () => {
    expect(clientKey("2001:db8::a:b:c:d")).toBe(clientKey("2001:0db8:0000:0000:0001:0002:0003:0004"));
    expect(clientKey("2001:db8:1:2::1")).toBe("2001:db8:1:2");
    expect(clientKey("2001:db8:1:3::1")).not.toBe(clientKey("2001:db8:1:2::1"));
    expect(clientKey("::1")).toBe("0:0:0:0");
    expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("deletes old searches and counters on its daily sweep", async () => {
    const catalog = env.CATALOG.getByName("catalog");
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await runInDurableObject(catalog, (_c, state) => {
      state.storage.kv.put("q:old private words", { at: old, ids: [] });
      state.storage.kv.put("q:recent", { at: Date.now(), ids: [] });
      state.storage.kv.put("c:stale", { at: old, page: { films: [], nextCursor: null } });
      state.storage.kv.put("day:2000-01-01", 5);
      state.storage.kv.put("month:2000-01", 5);
    });
    expect(await runDurableObjectAlarm(catalog)).toBe(true);
    const left = await runInDurableObject(catalog, (_c, state) => ({
      old: state.storage.kv.get("q:old private words"), recent: state.storage.kv.get("q:recent"),
      stale: state.storage.kv.get("c:stale"), day: state.storage.kv.get("day:2000-01-01"), month: state.storage.kv.get("month:2000-01"),
    }));
    expect(left).toEqual({ old: undefined, recent: expect.anything(), stale: undefined, day: undefined, month: undefined });
    expect(await runInDurableObject(catalog, (_c, state) => state.storage.getAlarm())).not.toBeNull(); // the next sweep is booked
  });

  it("measures the search length after normalising", async () => {
    expect((await get(`/api/search?q=${encodeURIComponent("\uFDFA".repeat(10))}`)).status).toBe(400); // 10 chars that expand to 180
  });
});

describe("picks", () => {
  it("saves answers and favourites privately and marks ready", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    const guest = await join(code, "Noor");
    await host.until("state"); // Noor joined
    const ids = await search("godfather");

    guest.send({ type: "setReady", ready: true });
    expect(await guest.next()).toEqual({ type: "error", code: "WRONG_PHASE" }); // nothing picked yet

    // Sent back to back: the room handles them in order even though favourites wait on the Catalog.
    guest.send(answers);
    guest.send({ type: "setFavourites", ids });
    guest.send({ type: "setReady", ready: true });

    expect((await guest.until("you")).you.answers?.mood).toBe("funny");
    const mine = (await guest.until("you")).you;
    expect(mine.favourites.map((f) => f.title)).toEqual(["The Godfather", "The Godfather Part II"]);
    expect(Object.keys(mine.favourites[0]).sort()).toEqual(["id", "poster", "title", "year"]);

    let seen = await host.until("state");
    while (!seen.state.members[1].ready) seen = await host.until("state");
    expect(JSON.stringify(seen)).not.toContain("Godfather"); // others never see picks
    expect(JSON.stringify(seen)).not.toContain("funny");

    guest.send({ ...answers, mood: "tense" }); // editing clears the stamp
    while (seen.state.members[1].ready) seen = await host.until("state");

    const other = await join(code, "Leila"); // a new seat sees no private data
    expect(other.welcome.you).toEqual({ favourites: [] });
  });

  it("rejects services outside the region and films it has never listed", async () => {
    const { code } = await createRoom();
    const member = await join(code, "Sam");
    member.send({ ...answers, serviceIds: ["iplayer"] }); // not offered in the room's region (US)
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    member.send({ type: "setFavourites", ids: ["neverlisted"] });
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    member.send({ type: "setFavourites", ids: ["fx1", "fx1"] });
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
  });

  it("lets only the host change region, which clears services and ready", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    const guest = await join(code, "Noor");
    const ids = await search("paddington");
    guest.send(answers);
    guest.send({ type: "setFavourites", ids });
    guest.send({ type: "setReady", ready: true });

    guest.send({ type: "setRegion", region: "GB" });
    expect(await guest.until("error")).toEqual({ type: "error", code: "NOT_HOST" });
    host.send({ type: "setRegion", region: "ZZ" });
    expect(await host.until("error")).toEqual({ type: "error", code: "BAD_MESSAGE" });

    host.send({ type: "setRegion", region: "GB" });
    let mine = (await guest.until("you")).you;
    while (mine.answers?.serviceIds.length) mine = (await guest.until("you")).you;
    expect(mine.answers?.mood).toBe("funny"); // the rest is kept
    expect(mine.favourites).toHaveLength(1);
    let seen = await guest.until("state");
    while (seen.state.region !== "GB") seen = await guest.until("state");
    expect(seen.state.members.every((m) => !m.ready)).toBe(true);

    guest.send({ type: "setReady", ready: true });
    expect(await guest.until("error")).toEqual({ type: "error", code: "WRONG_PHASE" }); // needs a service again
  });
});

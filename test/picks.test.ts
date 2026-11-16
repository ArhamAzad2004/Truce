import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { FilmRow, Region, Service } from "../shared/protocol";
import { parseCountries, parseShows } from "../worker/motn";
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

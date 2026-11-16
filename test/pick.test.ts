import { describe, expect, it } from "vitest";
import { LIMITS } from "../shared/limits";
import type { Answers, Favourite, Film } from "../shared/protocol";
import type { CandidateQuery } from "../worker/motn";
import { parseCandidates } from "../worker/motn";
import { type Fetch, type Voter, pick, reason } from "../worker/pick";
import { createRoom, join } from "./helpers";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";

const netflix = { id: "netflix", name: "Netflix" };
const prime = { id: "prime", name: "Prime Video" };

const film = (movieId: string, over: Partial<Film> = {}): Film => ({
  movieId, title: `Film ${movieId}`, year: 2015, poster: null, runtime: 100, rating: 75,
  genres: ["comedy"], directors: ["Nobody"], cast: [], services: [netflix], ...over,
});
const fav = (id: string, over: Partial<Favourite> = {}): Favourite =>
  ({ id, title: `Fav ${id}`, year: 2012, poster: null, genres: ["comedy"], directors: ["Someone"], cast: [], ...over });
const voter = (id: string, answers: Partial<Answers> = {}, favourites = [fav(`${id}1`)]): Voter =>
  ({ id, answers: { mood: "funny", energy: "awake", maxMinutes: 120, serviceIds: ["netflix"], ...answers }, favourites });

/** A Catalog that always returns the same films, and records what it was asked. */
function catalog(films: Film[], asked: CandidateQuery[] = []): Fetch {
  return async (query) => { asked.push(query); return { ok: true, data: { films, nextCursor: null } }; };
}

describe("pick", () => {
  it("applies the hard filters", async () => {
    const out = await pick("US", [voter("a"), voter("b")], catalog([
      film("ok1"), film("ok2"), film("ok3"),
      film("long", { runtime: 131 }), // limit 120 + 10
      film("elsewhere", { services: [prime] }),
      film("poor", { rating: 59 }),
      film("future", { year: 2999 }),
      film("a1"), // someone's favourite
    ]));
    expect(out.ok && out.ranking.map((f) => f.movieId).sort()).toEqual(["ok1", "ok2", "ok3"]);
  });

  it("narrows services to the ones the group has", async () => {
    const out = await pick("US", [voter("a"), voter("b")], catalog([film("x", { services: [prime, netflix] }), film("y"), film("z")]));
    expect(out.ok && out.ranking.find((f) => f.movieId === "x")?.services).toEqual([netflix]);
  });

  it("prefers a film that suits everyone over one that thrills a single person", async () => {
    const a = voter("a", {}, [fav("a1", { genres: ["horror"], directors: ["Carpenter"] })]);
    const b = voter("b", {}, [fav("b1", { genres: ["romance"] })]);
    const out = await pick("US", [a, b], catalog([
      film("onlyA", { genres: ["horror"], directors: ["Carpenter"] }),
      film("both", { genres: ["horror", "romance"] }),
      film("neither", { genres: ["war"] }),
    ]));
    expect(out.ok && out.ranking.map((f) => f.movieId)).toEqual(["both", "onlyA", "neither"]);
  });

  it("relaxes the runtime before giving up, and gives up cleanly", async () => {
    const asked: CandidateQuery[] = [];
    const relaxed = await pick("US", [voter("a"), voter("b")], catalog([film("longish", { runtime: 145 })], asked));
    expect(relaxed.ok && relaxed.ranking[0].movieId).toBe("longish"); // 120 + 10 + 20
    expect(asked.length).toBeLessThanOrEqual(5);
    expect(asked.at(-1)?.genres).toEqual([]); // last rung: any genre

    expect(await pick("US", [voter("a"), voter("b")], catalog([film("epic", { runtime: 200 })]))).toEqual({ ok: false, notice: "NO_CANDIDATES" });
  });

  it("reports why the listings failed when there is too little to go on", async () => {
    const resting: Fetch = async () => ({ ok: false, error: "QUOTA_REACHED", scope: "day" });
    expect(await pick("US", [voter("a"), voter("b")], resting)).toEqual({ ok: false, notice: "QUOTA_REACHED" });
    const down: Fetch = async () => ({ ok: false, error: "UPSTREAM" });
    expect(await pick("US", [voter("a"), voter("b")], down)).toEqual({ ok: false, notice: "PICK_FAILED" });
  });

  it("keeps ten for the ranking and the rest in the pool, with a reason for every voter", async () => {
    const films = Array.from({ length: 14 }, (_, i) => film(`f${i}`, { rating: 60 + i }));
    const out = await pick("US", [voter("a"), voter("b")], catalog(films));
    if (!out.ok) throw new Error("expected a ranking");
    expect(out.ranking).toHaveLength(10);
    expect(out.pool).toHaveLength(4);
    expect(out.ranking[0].movieId).toBe("f13"); // ties on affinity fall to rating
    for (const f of out.ranking) {
      expect(Object.keys(f.reasons)).toEqual(["a", "b"]);
      for (const text of Object.values(f.reasons)) expect(text.length).toBeLessThanOrEqual(LIMITS.reasonChars);
    }
  });

  it("writes reasons from real overlaps, in order of preference", () => {
    const v = voter("a", { mood: "tense", maxMinutes: 90 }, [fav("a1", { title: "x".repeat(120), genres: ["scifi"], directors: ["Nolan"] })]);
    expect(reason(film("1", { directors: ["Nolan"] }), v)).toBe(`From the director of ${"x".repeat(59)}….`);
    expect(reason(film("2", { genres: ["scifi"] }), v)).toBe(`Like ${"x".repeat(59)}…, it's a sci-fi film.`);
    expect(reason(film("3", { genres: ["thriller"] }), v)).toBe("You asked for tense. This is that.");
    expect(reason(film("4", { genres: ["war"] }), v)).toBe("On Netflix and inside your 90 minutes.");
  });

  it("reads a candidate page from the API shape", () => {
    const page = parseCandidates({
      hasMore: true, nextCursor: "82:The Godfather",
      shows: [
        {
          id: "82", title: "The Godfather", showType: "movie", releaseYear: 1972, runtime: 175, rating: 93, overview: "dropped",
          genres: [{ id: "crime" }], directors: ["Francis Ford Coppola"], cast: ["Marlon Brando"],
          imageSet: { verticalPoster: { w240: "https://cdn.movieofthenight.com/a.jpg", w360: "https://cdn.movieofthenight.com/b.jpg" } },
          streamingOptions: { ae: [
            { service: { id: "netflix", name: "Netflix" }, type: "subscription" },
            { service: { id: "netflix", name: "Netflix" }, type: "subscription" },
            { service: { id: "apple", name: "Apple TV" }, type: "rent" },
          ], us: [{ service: { id: "hulu", name: "Hulu" }, type: "free" }] },
        },
        { id: "83", title: "No runtime", showType: "movie", releaseYear: 2000, rating: 70 },
      ],
    }, "AE");
    expect(page).toEqual({
      nextCursor: "82:The Godfather",
      films: [{
        movieId: "82", title: "The Godfather", year: 1972, poster: "https://cdn.movieofthenight.com/b.jpg", runtime: 175, rating: 93,
        genres: ["crime"], directors: ["Francis Ford Coppola"], cast: ["Marlon Brando"], services: [netflix],
      }],
    });
  });
});

describe("settle", () => {
  const ready = async (member: Awaited<ReturnType<typeof join>>, q: string) => {
    const res = await exports.default.fetch(`http://truce.test/api/search?q=${q}`);
    const ids = ((await res.json()) as { id: string }[]).map((f) => f.id).slice(0, 3);
    member.send({ type: "setAnswers", mood: "funny", energy: "awake", maxMinutes: null, serviceIds: ["netflix", "prime"] });
    member.send({ type: "setFavourites", ids });
    member.send({ type: "setReady", ready: true });
  };
  const untilPhase = async (member: Awaited<ReturnType<typeof join>>, phase: string) => {
    for (;;) { const msg = await member.until("state"); if (msg.state.phase === phase) return msg.state; }
  };

  it("settles for the ready members, shows one pick to everyone, and reopens", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    const guest = await join(code, "Noor");
    const watcher = await join(code, "Leila"); // never readies up

    host.send({ type: "settle" });
    expect(await host.until("error")).toEqual({ type: "error", code: "WRONG_PHASE" }); // nobody is ready

    await ready(host, "godfather");
    await ready(guest, "paddington");
    guest.send({ type: "settle" });
    expect(await guest.until("error")).toEqual({ type: "error", code: "NOT_HOST" });

    host.send({ type: "settle" });
    host.send({ type: "settle" }); // a double tap is refused, not run twice
    await untilPhase(watcher, "settling");
    const result = await untilPhase(watcher, "result");
    expect(await host.until("error")).toEqual({ type: "error", code: "WRONG_PHASE" });

    expect(result.settlesLeft).toBe(LIMITS.settleAttempts - 1);
    expect(Object.keys(result.pick!.reasons).sort()).toEqual([host.welcome.memberId, guest.welcome.memberId].sort());
    expect(result.pick!.services.length).toBeGreaterThan(0);
    expect(Object.keys(result.pick!).sort()).toEqual(["movieId", "poster", "reasons", "runtime", "services", "title", "year"]);
    expect(Object.keys(result)).not.toContain("result"); // no ranking, no pool

    guest.send({ type: "reopen" });
    expect(await guest.until("error")).toEqual({ type: "error", code: "NOT_HOST" });
    host.send({ type: "reopen" });
    const lobby = await untilPhase(watcher, "lobby");
    expect(lobby.pick).toBeUndefined();
    expect(lobby.members.every((m) => !m.ready)).toBe(true);
  });
});

describe("settle budget", () => {
  it("gives each network a daily number of settles", async () => {
    const { code, hostToken } = await createRoom();
    const sock = (ip: string) => exports.default.fetch(`http://truce.test/api/rooms/${code}/ws`, {
      headers: { Upgrade: "websocket", Origin: "http://truce.test", "CF-Connecting-IP": ip },
    });
    const res = await sock("198.51.100.20");
    const ws = res.webSocket!;
    ws.accept();
    const got: unknown[] = [];
    ws.addEventListener("message", (e) => got.push(JSON.parse(e.data as string)));
    ws.send(JSON.stringify({ type: "join", nickname: "Sam", hostToken }));
    await runInDurableObject(env.CATALOG.getByName("catalog"), async (catalog) => {
      for (let i = 0; i < 10; i++) await (catalog as unknown as { allow(b: string, c: string): Promise<boolean> }).allow("settlesDay", "198.51.100.20");
    });
    await runInDurableObject(env.ROOM.getByName(code), (_room, state) => {
      const room = state.storage.kv.get<{ members: Record<string, { ready: boolean; answers: object }> }>("room")!;
      for (const m of Object.values(room.members)) { m.ready = true; m.answers = { mood: "funny", energy: "awake", maxMinutes: null, serviceIds: ["netflix"] }; }
      room.members.other = { ...Object.values(room.members)[0] };
      state.storage.kv.put("room", room);
    });
    ws.send(JSON.stringify({ type: "settle" }));
    for (let i = 0; i < 50 && !got.some((m) => (m as { type: string }).type === "error"); i++) await new Promise((r) => setTimeout(r, 20));
    expect(got).toContainEqual({ type: "error", code: "QUOTA_REACHED", scope: "day" });
    ws.close();
  });
});

describe("veto", () => {
  it("gives each voter one veto, moves to a new film each time, and ends cleanly when the list runs out", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    const guest = await join(code, "Noor");
    const watcher = await join(code, "Leila"); // not part of the pick
    for (const [member, q] of [[host, "godfather"], [guest, "paddington"]] as const) {
      const res = await exports.default.fetch(`http://truce.test/api/search?q=${q}`);
      member.send({ type: "setAnswers", mood: "funny", energy: "awake", maxMinutes: null, serviceIds: ["netflix", "prime"] });
      member.send({ type: "setFavourites", ids: ((await res.json()) as { id: string }[]).map((f) => f.id) });
      member.send({ type: "setReady", ready: true });
    }
    const resultState = async () => {
      for (;;) { const msg = await watcher.until("state"); if (msg.state.phase === "result") return msg.state; }
    };

    guest.send({ type: "veto" });
    expect(await guest.until("error")).toEqual({ type: "error", code: "WRONG_PHASE" }); // nothing to veto yet

    host.send({ type: "settle" });
    const first = await resultState();
    watcher.send({ type: "veto" });
    expect(await watcher.until("error")).toEqual({ type: "error", code: "WRONG_PHASE" }); // no reason, no veto

    guest.send({ type: "veto" });
    const second = await resultState();
    expect(second.pick!.movieId).not.toBe(first.pick!.movieId);
    expect(second.vetoedBy).toBe(guest.welcome.memberId);
    expect(second.members.find((m) => m.id === guest.welcome.memberId)?.vetoUsed).toBe(true);
    expect(Object.keys(second.pick!.reasons).sort()).toEqual(Object.keys(first.pick!.reasons).sort());

    guest.send({ type: "veto" });
    expect(await guest.until("error")).toEqual({ type: "error", code: "VETO_USED" });

    // Leave nothing after the current film, then spend the last veto.
    await runInDurableObject(env.ROOM.getByName(code), (_room, state) => {
      const room = state.storage.kv.get<{ result: { ranking: unknown[]; index: number; pool: unknown[] } }>("room")!;
      room.result.ranking.length = room.result.index + 1;
      room.result.pool = [];
      state.storage.kv.put("room", room);
    });
    host.send({ type: "veto" });
    const end = await resultState();
    expect(end.exhausted).toBe(true);
    expect(end.pick).toBeUndefined();

    host.send({ type: "reopen" });
    for (;;) {
      const msg = await watcher.until("state");
      if (msg.state.phase !== "lobby") continue;
      expect(msg.state.members.some((m) => m.vetoUsed)).toBe(false);
      expect(msg.state.exhausted).toBeUndefined();
      break;
    }
  });
});

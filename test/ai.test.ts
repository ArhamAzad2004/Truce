import { describe, expect, it } from "vitest";
import type { Answers, Favourite, Film } from "../shared/protocol";
import { type Voter, withReasons } from "../worker/pick";
import { buildPrompt, rank } from "../worker/pick/ai";

const config = { apiKey: "test-key", baseUrl: "https://ai.test/v1/", model: "test-model" };
const answers: Answers = { mood: "funny", energy: "awake", maxMinutes: 120, serviceIds: ["netflix"] };
const fav = (id: string): Favourite =>
  ({ id, title: `Fav ${id}`, year: 2012, poster: null, genres: ["comedy"], directors: ["Dee Rector"], cast: ["Cass Member"] });
const voters: Voter[] = [
  { id: "m_secretA", answers, favourites: [fav("a1")] },
  { id: "m_secretB", answers, favourites: [fav("b1")] },
];
const film = (movieId: string): Film => ({
  movieId, title: `Film ${movieId}`, year: 2015, poster: null, runtime: 100, rating: 75,
  genres: ["comedy"], directors: ["Dee Rector"], cast: ["Cass Member"], services: [{ id: "netflix", name: "Netflix" }],
});
const shortlist = ["1", "2", "3", "4", "5"].map((id) => withReasons(film(id), voters));

const entry = (id: string, text = `Reason for ${id}.`, members = ["P1", "P2"]) =>
  ({ id, reasons: members.map((member) => ({ member, text })) });
const reply = (ranking: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ranking }) } }] }));

/** A fake AI that answers with each reply in turn and records the request bodies. */
function fake(...replies: (() => Response | Promise<Response>)[]) {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(init!.body as string));
    return replies[bodies.length - 1]();
  }) as typeof fetch;
  return { fetcher, bodies };
}

describe("AI ranking", () => {
  it("puts the model's three first with its reasons, then the rest in score order", async () => {
    const ai = fake(() => reply([entry("4", "  You wanted   funny; this is it. "), entry("2"), entry("5")]));
    const out = await rank(shortlist, voters, config, ai);
    expect(out?.map((f) => f.movieId)).toEqual(["4", "2", "5", "1", "3"]);
    expect(out?.[0].reasons).toEqual({ m_secretA: "You wanted funny; this is it.", m_secretB: "You wanted funny; this is it." });
    expect(out?.[3].reasons).toEqual(shortlist[0].reasons); // untouched template reasons
    expect(out?.[0].title).toBe("Film 4"); // film facts come from the shortlist, not the model
  });

  it("retries once after an invented film, telling the model what was wrong", async () => {
    const ai = fake(() => reply([entry("999"), entry("2"), entry("3")]), () => reply([entry("1"), entry("2"), entry("3")]));
    const out = await rank(shortlist, voters, config, ai);
    expect(out?.slice(0, 3).map((f) => f.movieId)).toEqual(["1", "2", "3"]);
    expect(ai.bodies).toHaveLength(2);
    expect(ai.bodies[1].messages.at(-1)?.content).toContain("not an id from candidates");
  });

  it.each([
    ["an invented film twice", [entry("999"), entry("2"), entry("3")]],
    ["a missing member", [entry("1", "ok", ["P1"]), entry("2"), entry("3")]],
    ["an unknown member", [entry("1", "ok", ["P1", "P7"]), entry("2"), entry("3")]],
    ["an over-long reason", [entry("1", "x".repeat(141)), entry("2"), entry("3")]],
    ["a link in a reason", [entry("1", "See www.example.com"), entry("2"), entry("3")]],
    ["a repeated film", [entry("1"), entry("1"), entry("3")]],
    ["too few films", [entry("1"), entry("2")]],
  ])("falls back after %s", async (_name, ranking) => {
    const ai = fake(() => reply(ranking), () => reply(ranking));
    expect(await rank(shortlist, voters, config, ai)).toBeNull();
    expect(ai.bodies).toHaveLength(2);
  });

  it("falls back at once on a rate limit, without retrying", async () => {
    const ai = fake(() => new Response("slow down", { status: 429 }));
    expect(await rank(shortlist, voters, config, ai)).toBeNull();
    expect(ai.bodies).toHaveLength(1);
  });

  it("falls back on a timeout", async () => {
    const fetcher = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const started = Date.now();
    expect(await rank(shortlist, voters, config, { fetcher, budgetMs: 150 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not retry when the deadline is nearly spent", async () => {
    const slow = () => new Promise<Response>((resolve) => setTimeout(() => resolve(reply([entry("999"), entry("2"), entry("3")])), 90));
    const ai = fake(slow, slow);
    expect(await rank(shortlist, voters, config, { ...ai, budgetMs: 100 })).toBeNull();
    expect(ai.bodies).toHaveLength(1);
  });

  it("skips the call when there is nothing to choose between", async () => {
    const ai = fake();
    expect(await rank(shortlist.slice(0, 2), voters, config, ai)).toBeNull();
    expect(ai.bodies).toHaveLength(0);
  });

  it("sends the model only labels, taps and titles", () => {
    const { system, user } = buildPrompt(shortlist, voters);
    const sent = system + user;
    for (const secret of ["m_secret", "Dee Rector", "Cass Member", "netflix\"", "poster", "rating", "overview", "nickname", "token"]) {
      expect(sent).not.toContain(secret);
    }
    const data = JSON.parse(user);
    expect(Object.keys(data)).toEqual(["members", "candidates"]);
    expect(data.members[0]).toEqual({ member: "P1", mood: "funny", energy: "awake", maxMinutes: 120, favourites: [{ title: "Fav a1", year: 2012 }] });
    expect(Object.keys(data.candidates[0])).toEqual(["id", "title", "year", "genres", "runtime", "serviceNames"]);
  });
});

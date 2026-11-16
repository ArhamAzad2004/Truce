// The deterministic pick: candidates -> hard filters -> score -> template reasons.
// This is the permanent fallback; the AI ranking (Phase 7) may only reorder what this produces.
// Mirrors docs/BACKEND_SCHEMA.md §8 and §10.
import type { Answers, Favourite, Film, Notice } from "../../shared/protocol";
import type { Result } from "../catalog";
import type { CandidatePage, CandidateQuery } from "../motn";

export type Voter = { id: string; answers: Answers; favourites: Favourite[] };
export type Ranked = Film & { reasons: Record<string, string> };
export type Outcome = { ok: true; ranking: Ranked[]; pool: Film[] } | { ok: false; notice: Notice };
export type Fetch = (query: CandidateQuery) => Promise<Result<CandidatePage>>;

const SHORTLIST = 10;
const ENOUGH = 3; // fewer survivors than this starts the relaxation ladder

// Starting values, to be tuned from real use.
const MOOD_GENRES: Record<Answers["mood"], string[]> = {
  cosy: ["family", "romance", "animation"],
  funny: ["comedy"],
  tense: ["thriller", "crime", "horror"],
  moving: ["drama", "romance"],
  mind_bending: ["scifi", "mystery"],
  feel_good: ["comedy", "family", "music"],
};
const SLEEPY = ["comedy", "family", "animation"];
const WIRED = ["action", "thriller", "adventure"];

const MOOD_WORDS: Record<Answers["mood"], string> = {
  cosy: "cosy", funny: "funny", tense: "tense", moving: "moving", mind_bending: "mind-bending", feel_good: "feel-good",
};
const GENRE_WORDS: Record<string, string> = {
  action: "an action film", adventure: "an adventure", animation: "an animated film", comedy: "a comedy",
  crime: "a crime story", documentary: "a documentary", drama: "a drama", family: "a family film",
  fantasy: "a fantasy", history: "a historical film", horror: "a horror film", music: "a music film",
  mystery: "a mystery", romance: "a romance", scifi: "a sci-fi film", thriller: "a thriller",
  war: "a war film", western: "a western",
};
const TIME_WORDS: Record<number, string> = { 90: "90 minutes", 120: "two hours", 150: "two and a half hours" };

const overlap = (a: string[], b: string[]) => a.some((x) => b.includes(x));
const short = (title: string) => (title.length > 60 ? `${title.slice(0, 59)}…` : title);

/** How well one film suits one person's three favourites, 0 to 1. */
function affinity(film: Film, voter: Voter) {
  const favs = voter.favourites;
  if (!favs.length || !film.genres.length) return 0;
  // Share of the film's genres found in the favourites, weighted by how often each appears.
  const genre = film.genres.reduce((sum, g) => sum + favs.filter((f) => f.genres.includes(g)).length / favs.length, 0) / film.genres.length;
  const people = favs.some((f) => overlap(f.directors, film.directors)) ? 1 : favs.some((f) => overlap(f.cast, film.cast)) ? 0.5 : 0;
  const gap = Math.min(...favs.map((f) => (f.year === null ? Infinity : Math.abs(f.year - film.year))));
  const era = gap <= 10 ? 1 : gap <= 20 ? 0.5 : 0;
  return 0.6 * genre + 0.25 * people + 0.15 * era;
}

function energyFit(film: Film, energy: Answers["energy"]) {
  if (energy === "half_asleep") return (film.runtime <= 100 ? 0.5 : 0) + (overlap(film.genres, SLEEPY) ? 0.5 : 0);
  if (energy === "wired") return overlap(film.genres, WIRED) ? 1 : 0;
  return 0.5;
}

/** Leans on the least-happy person, so nobody is left out. */
export function score(film: Film, voters: Voter[]) {
  const fits = voters.map((v) => affinity(film, v));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return 0.6 * Math.min(...fits) + 0.4 * mean(fits)
    + 0.15 * mean(voters.map((v) => (overlap(film.genres, MOOD_GENRES[v.answers.mood]) ? 1 : 0)))
    + 0.05 * mean(voters.map((v) => energyFit(film, v.answers.energy)))
    + 0.05 * (film.rating / 100);
}

/** One sentence built from a real overlap. Favourite titles come from the listings, never from typing. */
export function reason(film: Film, voter: Voter): string {
  const byDirector = voter.favourites.find((f) => overlap(f.directors, film.directors));
  if (byDirector) return `From the director of ${short(byDirector.title)}.`;

  const shared = (f: Favourite) => f.genres.filter((g) => film.genres.includes(g) && GENRE_WORDS[g]);
  const closest = [...voter.favourites].sort((a, b) => shared(b).length - shared(a).length)[0];
  if (closest && shared(closest).length) return `Like ${short(closest.title)}, it's ${GENRE_WORDS[shared(closest)[0]]}.`;

  if (overlap(film.genres, MOOD_GENRES[voter.answers.mood])) return `You asked for ${MOOD_WORDS[voter.answers.mood]}. This is that.`;

  const service = film.services.find((s) => voter.answers.serviceIds.includes(s.id)) ?? film.services[0];
  const time = voter.answers.maxMinutes === null ? "ready when you are" : `inside your ${TIME_WORDS[voter.answers.maxMinutes]}`;
  return `On ${service.name} and ${time}.`;
}

export const withReasons = (film: Film, voters: Voter[]): Ranked =>
  ({ ...film, reasons: Object.fromEntries(voters.map((v) => [v.id, reason(film, v)])) });

/** Runs the whole pick for the ready members. At most 5 Catalog calls. */
export async function pick(region: string, voters: Voter[], fetch: Fetch): Promise<Outcome> {
  const serviceIds = [...new Set(voters.flatMap((v) => v.answers.serviceIds))];
  const limits = voters.map((v) => v.answers.maxMinutes).filter((m) => m !== null);
  const limit = limits.length ? Math.min(...limits) : null;
  const moodGenres = [...new Set(voters.flatMap((v) => MOOD_GENRES[v.answers.mood]))];
  const favourites = voters.flatMap((v) => v.favourites);
  const favouriteIds = new Set(favourites.map((f) => f.id));
  const counts = new Map<string, number>();
  for (const g of favourites.flatMap((f) => f.genres)) counts.set(g, (counts.get(g) ?? 0) + 1);
  const favouriteGenres = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  const films = new Map<string, Film>();
  let failure = null as Notice | null; // assigned inside `load`, which the compiler cannot follow
  /** Adds a page to `films`; returns its next cursor, or null when there is none or the call failed. */
  const load = async (query: Omit<CandidateQuery, "country" | "serviceIds">) => {
    if (failure) return null;
    const page = await fetch({ country: region, serviceIds, ...query });
    if (!page.ok) { failure = page.error === "QUOTA_REACHED" ? "QUOTA_REACHED" : "PICK_FAILED"; return null; }
    for (const film of page.data.films) if (!films.has(film.movieId)) films.set(film.movieId, film);
    return page.data.nextCursor;
  };

  const year = new Date().getFullYear();
  const survivors = (extraMinutes: number) => [...films.values()].flatMap((film) => {
    // The hard filters. Nothing later (the AI included) can put a film back.
    const services = film.services.filter((s) => serviceIds.includes(s.id));
    const fits = services.length > 0
      && film.runtime > 0 && (limit === null || film.runtime <= limit + 10 + extraMinutes)
      && film.year > 1880 && film.year <= year
      && film.rating >= 60
      && !favouriteIds.has(film.movieId);
    return fits ? [{ ...film, services }] : [];
  });

  // About 60 candidates from 3 calls: the mood (2 pages), then what the group already loves.
  const popular = { genres: moodGenres, orderBy: "popularity_1year" } as const;
  let cursor = await load(popular);
  if (cursor) cursor = await load({ ...popular, cursor });
  if (favouriteGenres.length) await load({ genres: favouriteGenres, orderBy: "popularity_alltime" });

  // Relaxation ladder: one more page, then 20 more minutes, then any genre.
  let extraMinutes = 0;
  if (survivors(0).length < ENOUGH && cursor) await load({ ...popular, cursor });
  if (survivors(0).length < ENOUGH) extraMinutes = 20;
  if (survivors(extraMinutes).length < ENOUGH) await load({ genres: [], orderBy: "popularity_1year" });

  const left = survivors(extraMinutes);
  // A failed call is fine when enough films are already in hand; otherwise say why.
  if (failure && left.length < SHORTLIST) return { ok: false, notice: failure };
  if (!left.length) return { ok: false, notice: "NO_CANDIDATES" };

  const ordered = left
    .map((film) => ({ film, score: score(film, voters) }))
    .sort((a, b) => b.score - a.score || b.film.rating - a.film.rating || a.film.movieId.localeCompare(b.film.movieId))
    .map((x) => x.film);
  return {
    ok: true,
    ranking: ordered.slice(0, SHORTLIST).map((film) => withReasons(film, voters)),
    pool: ordered.slice(SHORTLIST),
  };
}

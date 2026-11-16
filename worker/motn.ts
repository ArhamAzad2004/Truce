// Client for the Streaming Availability API by Movie of the Night. Called only from the Catalog object.
// Everything not named in a schema below (overview included) is dropped before anything is cached.
import { z } from "zod";
import { FILM_ID_RE, LIMITS, SERVICE_ID_RE } from "../shared/limits";
import type { Favourite, Film, Service } from "../shared/protocol";

export type Countries = Record<string, { name: string; services: Service[] }>; // key = upper-case country code
export type CandidateQuery = {
  country: string; // upper case
  serviceIds: string[];
  genres: string[]; // empty = any genre
  orderBy: "popularity_1year" | "popularity_alltime";
  cursor?: string;
};
export type CandidatePage = { films: Film[]; nextCursor: string | null };
export type Source = {
  countries(): Promise<Countries>;
  search(query: string): Promise<Favourite[]>;
  candidates(query: CandidateQuery): Promise<CandidatePage>;
};

/** The API says the request allowance is used up. */
export class QuotaError extends Error {}

const BASE = "https://api.movieofthenight.com/v4";
const POSTER_HOST = "cdn.movieofthenight.com";

const Show = z.object({
  id: z.string().regex(FILM_ID_RE),
  title: z.string().min(1),
  showType: z.string().optional(),
  releaseYear: z.number().int().optional(),
  genres: z.array(z.object({ id: z.string() })).default([]),
  directors: z.array(z.string()).default([]),
  cast: z.array(z.string()).default([]),
  imageSet: z.object({ verticalPoster: z.record(z.string(), z.string()).optional() }).optional(),
  runtime: z.number().optional(),
  rating: z.number().optional(),
  streamingOptions: z.record(z.string(), z.array(z.object({
    service: z.object({ id: z.string(), name: z.string() }),
    type: z.string(),
  }))).optional(),
});

const Country = z.object({
  name: z.string().min(1),
  services: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    streamingOptionTypes: z.object({ subscription: z.boolean().optional(), free: z.boolean().optional() }).optional(),
  })).default([]),
});

const clean = (text: string, max: number) => text.replace(/\p{Cc}/gu, "").trim().slice(0, max);

function poster(url: string | undefined) {
  try { return url && new URL(url).protocol === "https:" && new URL(url).hostname === POSTER_HOST ? url : null; } catch { return null; }
}

/**
 * Movies only, trimmed to the fields Truce keeps. Entries that don't fit the schema are skipped.
 * Titles containing the whole query come first, best-rated first, so a well-known film beats an obscure namesake.
 */
export function parseShows(body: unknown, query = ""): Favourite[] {
  if (!Array.isArray(body)) return [];
  const found: { film: Favourite; rank: number }[] = [];
  for (const item of body) {
    const show = Show.safeParse(item);
    if (!show.success || (show.data.showType && show.data.showType !== "movie")) continue;
    const s = show.data;
    const title = clean(s.title, 120);
    found.push({
      rank: query && title.toLowerCase().includes(query) ? 1000 + (s.rating ?? 0) : 0,
      film: {
        id: s.id,
        title,
        year: s.releaseYear ?? null,
        poster: poster(s.imageSet?.verticalPoster?.w240),
        genres: s.genres.map((g) => g.id).slice(0, 8),
        directors: s.directors.map((d) => clean(d, 80)).slice(0, 3),
        cast: s.cast.map((c) => clean(c, 80)).slice(0, 5),
      },
    });
  }
  // Array.prototype.sort is stable: the API's order is kept within each rank.
  return found.sort((a, b) => b.rank - a.rank).slice(0, LIMITS.searchResults).map((f) => f.film);
}

const Page = z.object({ shows: z.array(z.unknown()), hasMore: z.boolean().optional(), nextCursor: z.string().optional() });

/** One page of the filtered search, for `country`. Films missing a year, runtime or rating are skipped. */
export function parseCandidates(body: unknown, country: string): CandidatePage {
  const page = Page.safeParse(body);
  if (!page.success) return { films: [], nextCursor: null };
  const films: Film[] = [];
  for (const item of page.data.shows) {
    const show = Show.safeParse(item);
    if (!show.success || (show.data.showType && show.data.showType !== "movie")) continue;
    const s = show.data;
    if (!s.releaseYear || !s.runtime || s.rating === undefined) continue;
    const services = new Map<string, Service>();
    for (const option of s.streamingOptions?.[country.toLowerCase()] ?? []) {
      // Rent, buy and add-on options never count as streamable.
      if ((option.type === "subscription" || option.type === "free") && SERVICE_ID_RE.test(option.service.id)) {
        services.set(option.service.id, { id: option.service.id, name: clean(option.service.name, 40) });
      }
    }
    const posters = s.imageSet?.verticalPoster;
    films.push({
      movieId: s.id,
      title: clean(s.title, 120),
      year: s.releaseYear,
      poster: poster(posters?.w360) ?? poster(posters?.w480) ?? poster(posters?.w240),
      runtime: s.runtime,
      rating: s.rating,
      genres: s.genres.map((g) => g.id).slice(0, 8),
      directors: s.directors.map((d) => clean(d, 80)).slice(0, 3),
      cast: s.cast.map((c) => clean(c, 80)).slice(0, 5),
      services: [...services.values()],
    });
  }
  return { films, nextCursor: page.data.hasMore && page.data.nextCursor ? page.data.nextCursor : null };
}

/** Countries with the services that offer subscription or free viewing, in the API's order. */
export function parseCountries(body: unknown): Countries {
  const out: Countries = {};
  if (!body || typeof body !== "object") return out;
  for (const [code, value] of Object.entries(body)) {
    const country = Country.safeParse(value);
    if (!country.success || !/^[a-z]{2}$/i.test(code)) continue;
    out[code.toUpperCase()] = {
      name: clean(country.data.name, 60),
      services: country.data.services
        .filter((s) => SERVICE_ID_RE.test(s.id) && (s.streamingOptionTypes?.subscription || s.streamingOptionTypes?.free))
        .slice(0, LIMITS.services)
        .map((s) => ({ id: s.id, name: clean(s.name, 40) })),
    };
  }
  return out;
}

async function get(key: string, path: string, params: Record<string, string> = {}) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new QuotaError();
  if (!res.ok) throw new Error(`film listings answered ${res.status}`);
  return res.json();
}

export const live = (key: string): Source => ({
  countries: async () => parseCountries(await get(key, "/countries")),
  search: async (query) =>
    parseShows(await get(key, "/shows/search/title", { title: query, country: "us", show_type: "movie", series_granularity: "show" }), query),
  candidates: async ({ country, serviceIds, genres, orderBy, cursor }) => {
    const params: Record<string, string> = {
      country: country.toLowerCase(),
      catalogs: serviceIds.flatMap((id) => [`${id}.subscription`, `${id}.free`]).join(","),
      show_type: "movie",
      rating_min: "60",
      order_by: orderBy,
    };
    if (genres.length) { params.genres = genres.join(","); params.genres_relation = "or"; }
    if (cursor) params.cursor = cursor;
    return parseCandidates(await get(key, "/shows/search/filters", params), country);
  },
});

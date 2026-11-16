// Client for the Streaming Availability API by Movie of the Night. Called only from the Catalog object.
// Everything not named in a schema below (overview included) is dropped before anything is cached.
import { z } from "zod";
import { FILM_ID_RE, LIMITS, SERVICE_ID_RE } from "../shared/limits";
import type { Favourite, Service } from "../shared/protocol";

export type Countries = Record<string, { name: string; services: Service[] }>; // key = upper-case country code
export type Source = { countries(): Promise<Countries>; search(query: string): Promise<Favourite[]> };

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

/** Movies only, trimmed to the fields Truce keeps. Entries that don't fit the schema are skipped. */
export function parseShows(body: unknown): Favourite[] {
  if (!Array.isArray(body)) return [];
  const films: Favourite[] = [];
  for (const item of body) {
    const show = Show.safeParse(item);
    if (!show.success || (show.data.showType && show.data.showType !== "movie")) continue;
    const s = show.data;
    films.push({
      id: s.id,
      title: clean(s.title, 120),
      year: s.releaseYear ?? null,
      poster: poster(s.imageSet?.verticalPoster?.w240),
      genres: s.genres.map((g) => g.id).slice(0, 8),
      directors: s.directors.map((d) => clean(d, 80)).slice(0, 3),
      cast: s.cast.map((c) => clean(c, 80)).slice(0, 5),
    });
    if (films.length === LIMITS.searchResults) break;
  }
  return films;
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
    parseShows(await get(key, "/shows/search/title", { title: query, country: "us", show_type: "movie", series_granularity: "show" })),
});

import { DurableObject } from "cloudflare:workers";
import { cleanQuery } from "../shared/limits";
import type { Favourite, FilmRow, QuotaScope } from "../shared/protocol";
import { fixtures } from "./fixtures";
import { type CandidatePage, type CandidateQuery, type Countries, QuotaError, type Source, live } from "./motn";

export type Fail = { ok: false; error: "QUOTA_REACHED"; scope: QuotaScope } | { ok: false; error: "UPSTREAM" };
type QuotaFail = Extract<Fail, { error: "QUOTA_REACHED" }>;
export type Result<T> = { ok: true; data: T } | Fail;

const DAY = 24 * 60 * 60 * 1000;
const CAPS = { month: 950, day: 120, searchDay: 100 }; // search stops early so open rooms can still settle
const COUNTRIES_TTL = 7 * DAY;
const SEARCH_TTL = 30 * DAY;
const CANDIDATES_TTL = DAY;
const BACKOFF = 6 * 60 * 60 * 1000; // after the API itself says the allowance is gone

const row = ({ id, title, year, poster }: Favourite): FilmRow => ({ id, title, year, poster });

/**
 * Singleton (`getByName("catalog")`): the only code that calls the film listings.
 * Keeps trimmed responses, counts requests per UTC day and month, and stops at the soft caps.
 */
export class Catalog extends DurableObject<Env> {
  private kv = this.ctx.storage.kv;
  private inflight = new Map<string, Promise<Result<FilmRow[]>>>();

  // No key = sample data, so local dev, tests and CI never spend the allowance.
  private source(): Source {
    const key = (this.env as { MOTN_API_KEY?: string }).MOTN_API_KEY;
    return key ? live(key) : fixtures;
  }

  private quota(kind: "search" | "other"): QuotaFail | null {
    const iso = new Date().toISOString();
    const fail = (scope: QuotaScope): QuotaFail => ({ ok: false, error: "QUOTA_REACHED", scope });
    if ((this.kv.get<number>("blockedUntil") ?? 0) > Date.now()) return fail("month");
    if ((this.kv.get<number>(`month:${iso.slice(0, 7)}`) ?? 0) >= CAPS.month) return fail("month");
    if ((this.kv.get<number>(`day:${iso.slice(0, 10)}`) ?? 0) >= (kind === "search" ? CAPS.searchDay : CAPS.day)) return fail("day");
    return null;
  }

  /** One upstream request: checked against the caps and counted before it is sent. */
  private async call<T>(kind: "search" | "other", request: () => Promise<T>): Promise<Result<T>> {
    const over = this.quota(kind);
    if (over) return over;
    const iso = new Date().toISOString();
    for (const key of [`month:${iso.slice(0, 7)}`, `day:${iso.slice(0, 10)}`]) {
      this.kv.put(key, (this.kv.get<number>(key) ?? 0) + 1);
    }
    try {
      return { ok: true, data: await request() };
    } catch (error) {
      if (error instanceof QuotaError) {
        this.kv.put("blockedUntil", Date.now() + BACKOFF);
        return { ok: false, error: "QUOTA_REACHED", scope: "month" };
      }
      console.error("film listings request failed"); // no query text, no key
      return { ok: false, error: "UPSTREAM" };
    }
  }

  async countries(): Promise<Result<Countries>> {
    const hit = this.kv.get<{ at: number; data: Countries }>("countries");
    if (hit && Date.now() - hit.at < COUNTRIES_TTL) return { ok: true, data: hit.data };
    const fresh = await this.call("other", () => this.source().countries());
    if (fresh.ok && Object.keys(fresh.data).length) this.kv.put("countries", { at: Date.now(), data: fresh.data });
    else if (hit) return { ok: true, data: hit.data }; // an old list beats none
    return fresh;
  }

  /** `raw` is validated by the Worker (3 to 60 chars). Repeats within 30 days cost nothing. */
  async search(raw: string): Promise<Result<FilmRow[]>> {
    const query = cleanQuery(raw);
    const hit = this.kv.get<{ at: number; ids: string[] }>(`q:${query}`);
    if (hit && Date.now() - hit.at < SEARCH_TTL) {
      return { ok: true, data: hit.ids.flatMap((id) => { const f = this.kv.get<Favourite>(`f:${id}`); return f ? [row(f)] : []; }) };
    }
    const running = this.inflight.get(query);
    if (running) return running;
    const request = this.call("search", () => this.source().search(query)).then((result): Result<FilmRow[]> => {
      if (!result.ok) return result;
      for (const film of result.data) this.kv.put(`f:${film.id}`, film);
      this.kv.put(`q:${query}`, { at: Date.now(), ids: result.data.map((f) => f.id) });
      return { ok: true, data: result.data.map(row) };
    }).finally(() => this.inflight.delete(query));
    this.inflight.set(query, request);
    return request;
  }

  /** One page of streamable films for a settle. The same question within 24 hours costs nothing. */
  async candidates(query: CandidateQuery): Promise<Result<CandidatePage>> {
    const normal = { ...query, serviceIds: [...query.serviceIds].sort(), genres: [...query.genres].sort() };
    // shortcut: old pages are never deleted (about 25 KB each); add a sweep if the object nears its storage limit.
    const key = `c:${JSON.stringify(normal)}`;
    const hit = this.kv.get<{ at: number; page: CandidatePage }>(key);
    if (hit && Date.now() - hit.at < CANDIDATES_TTL) return { ok: true, data: hit.page };
    const fresh = await this.call("other", () => this.source().candidates(normal));
    if (fresh.ok) this.kv.put(key, { at: Date.now(), page: fresh.data });
    return fresh;
  }

  /** Film records seen in an earlier search. Never calls upstream; an unknown id is `null`. */
  async films(ids: string[]): Promise<(Favourite | null)[]> {
    return ids.map((id) => this.kv.get<Favourite>(`f:${id}`) ?? null);
  }

  /** Whether new rooms and searches are paused, and for how long. */
  async status(): Promise<{ resting: QuotaScope | null }> {
    return { resting: this.quota("search")?.scope ?? null };
  }
}

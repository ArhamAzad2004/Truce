import { useEffect, useState } from "react";
import { LIMITS, cleanQuery } from "../../shared/limits";
import type { FilmRow, QuotaScope, You } from "../../shared/protocol";
import "./Picks.css";

type Search =
  | { kind: "idle" } | { kind: "loading" } | { kind: "failed" }
  | { kind: "resting"; scope: QuotaScope }
  | { kind: "results"; rows: FilmRow[] };

// Posters identify the film; they come straight from the listings' image host, without a referrer.
function Poster({ film }: { film: FilmRow }) {
  const [broken, setBroken] = useState(false);
  if (!film.poster || broken) return <span className="poster" aria-hidden="true" />;
  return <img className="poster" src={film.poster} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

type Props = { you: You; onDone: (ids: string[]) => void; onBack: () => void };

export function Favourites({ you, onDone, onBack }: Props) {
  const [picked, setPicked] = useState<FilmRow[]>(you.favourites);
  const [text, setText] = useState("");
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const query = cleanQuery(text);
  const full = picked.length >= LIMITS.favourites;

  useEffect(() => {
    if (query.length < LIMITS.searchMin) return setSearch({ kind: "idle" });
    const ctrl = new AbortController();
    setSearch({ kind: "loading" });
    // Each new search spends some of a small monthly allowance, so wait for a pause in typing.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.status === 503) return setSearch({ kind: "resting", scope: ((await res.json()) as { scope: QuotaScope }).scope });
        if (!res.ok) return setSearch({ kind: "failed" });
        setSearch({ kind: "results", rows: (await res.json()) as FilmRow[] });
      } catch {
        if (!ctrl.signal.aborted) setSearch({ kind: "failed" });
      }
    }, 500);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const add = (film: FilmRow) => {
    setPicked((list) => (list.length < LIMITS.favourites && !list.some((f) => f.id === film.id) ? [...list, film] : list));
    setText("");
  };
  const remove = (id: string) => setPicked((list) => list.filter((f) => f.id !== id));
  const rows = search.kind === "results" ? search.rows.filter((r) => !picked.some((f) => f.id === r.id)) : [];

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">Step 2 / 2</span>
      </header>
      <div className="stack">
        <h1 className="title">Three films you love.</h1>
        <p className="muted">Any year, any genre. They steer the pick.</p>
      </div>

      <div className="ticket">
        <ol className="ticket-section slots" aria-label="Your films">
          {Array.from({ length: LIMITS.favourites }, (_, i) => {
            const film = picked[i];
            return film ? (
              <li key={film.id} className="slot">
                <Poster film={film} />
                <span className="film-text"><strong>{film.title}</strong>{film.year && <span className="hint">{film.year}</span>}</span>
                <button className="btn-link" type="button" onClick={() => remove(film.id)} aria-label={`Remove ${film.title}`}>Remove</button>
              </li>
            ) : (
              <li key={i} className="slot slot-empty"><span className="poster" aria-hidden="true" /><span className="hint">Film {i + 1}</span></li>
            );
          })}
        </ol>

        <div className="perf" aria-hidden="true" />

        <div className="ticket-section stack">
          <div className="field">
            <label htmlFor="film-search">Search films</label>
            <input
              id="film-search" className="input" type="search" value={text} disabled={full}
              placeholder={full ? "That's your three" : "Start typing a title"}
              autoComplete="off" enterKeyHint="search" maxLength={LIMITS.searchMax}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div aria-live="polite">
            {search.kind === "loading" && <p className="hint">Searching…</p>}
            {search.kind === "failed" && <p className="error">Search is slow right now. Try again in a moment.</p>}
            {search.kind === "resting" && <p className="hint">Search is resting. Back {search.scope === "day" ? "tomorrow" : "next month"}.</p>}
            {search.kind === "results" && rows.length === 0 && <p className="hint">Nothing by that name. Try fewer words.</p>}
          </div>
          {rows.length > 0 && (
            <ul className="results">
              {rows.map((film) => (
                <li key={film.id}>
                  <button className="result" type="button" onClick={() => add(film)} aria-disabled={full}>
                    <Poster film={film} />
                    <span className="film-text"><strong>{film.title}</strong>{film.year && <span className="hint">{film.year}</span>}</span>
                    <span className="btn-link" aria-hidden="true">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="stack">
        <button className="btn btn-primary" type="button" aria-disabled={!full} onClick={() => full && onDone(picked.map((f) => f.id))}>
          I'm ready
        </button>
        <button className="btn-text" type="button" onClick={onBack}>Back to my answers</button>
      </div>
    </main>
  );
}

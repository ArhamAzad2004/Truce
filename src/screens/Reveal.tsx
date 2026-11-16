import { useEffect, useState } from "react";
import type { PublicState, You } from "../../shared/protocol";
import { SiteFooter } from "../components/Attribution";
import "./Reveal.css";

/** Dims the house light (the spill at the top of the page) while this screen is up. */
function useLightsDown() {
  useEffect(() => {
    document.documentElement.classList.add("lights-down");
    return () => document.documentElement.classList.remove("lights-down");
  }, []);
}

export function Settling() {
  useLightsDown();
  return (
    <main className="screen settling">
      <header className="screen-head"><span className="wordmark" aria-label="Truce">TRUCE</span></header>
      <div className="stack" role="status">
        <h1 className="title">House lights going down.</h1>
        <p className="muted">Finding a film you can all stream.</p>
      </div>
      <div className="slot-bar" aria-hidden="true" />
    </main>
  );
}

const runtime = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

function Poster({ src, title }: { src: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken
    ? <img className="pick-poster" src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <span className="pick-poster pick-poster-blank" aria-hidden="true">{title}</span>;
}

type Props = { state: PublicState; memberId: string | null; you: You; onVeto: () => void; onReopen: () => void };

export function Reveal({ state, memberId, you, onVeto, onReopen }: Props) {
  const pick = state.pick;
  const isHost = memberId !== null && memberId === state.hostId;
  useLightsDown();
  // After a veto the lights come up for a beat before the runner-up prints.
  const movieId = pick?.movieId;
  const afterVeto = Boolean(state.vetoedBy);
  useEffect(() => {
    if (!afterVeto) return;
    const root = document.documentElement;
    root.classList.add("lights-beat");
    const timer = setTimeout(() => root.classList.remove("lights-beat"), 900);
    return () => { clearTimeout(timer); root.classList.remove("lights-beat"); };
  }, [movieId, afterVeto]);
  const tearer = state.members.find((m) => m.id === state.vetoedBy)?.nickname;

  // Every streamable film has been vetoed: the way out is the host's lobby.
  if (!pick) {
    return (
      <main className="screen">
        <header className="screen-head"><span className="wordmark" aria-label="Truce">TRUCE</span></header>
        <h1 className="title">That's everything you can all stream.</h1>
        {isHost
          ? <button className="btn btn-primary" type="button" onClick={onReopen}>Back to the lobby</button>
          : <p className="muted">The host can reopen the lobby so you can loosen a filter.</p>}
      </main>
    );
  }

  // The people the pick was made for: each has a reason and one veto.
  const voters = state.members.filter((m) => pick.reasons[m.id]);
  const mine = voters.find((m) => m.id === memberId);
  const vetoesLeft = voters.filter((m) => !m.vetoUsed).length;
  // Lead with a service this person actually has.
  const service = pick.services.find((s) => you.answers?.serviceIds.includes(s.id)) ?? pick.services[0];

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">Admit {voters.length} · Tonight</span>
      </header>

      <p className="note" role="status">{tearer && `${tearer} tore it up. Here's the runner-up.`}</p>

      <div className="slot-bar" aria-hidden="true" />
      {/* Keyed by film, so a runner-up prints as a new ticket. */}
      <div key={pick.movieId} className={afterVeto ? "feed feed-again" : "feed"}>
      <article className="ticket reveal" aria-labelledby="pick-title">
        <div className="ticket-section pick">
          <Poster src={pick.poster} title={pick.title} />
          <div className="pick-text">
            <h1 id="pick-title" className="pick-title">{pick.title}</h1>
            <p className="ink-muted">{pick.year} · {runtime(pick.runtime)}</p>
            {service && <p><span className="tag label">On {service.name}</span></p>}
          </div>
        </div>

        <div className="perf" aria-hidden="true" />

        <div className="ticket-section stack">
          <h2 className="label ink-muted">Why this one</h2>
          <ul className="reasons">
            {voters.map((m) => (
              <li key={m.id}><strong>{m.nickname}:</strong> {pick.reasons[m.id]}</li>
            ))}
          </ul>
        </div>

        <div className="perf" aria-hidden="true" />

        <div className="ticket-section stack veto-stub">
          {vetoesLeft === 0 ? (
            <p>No vetoes left. This is tonight's film.</p>
          ) : mine && !mine.vetoUsed ? (
            <>
              <button className="btn btn-ghost" type="button" onClick={onVeto}>Tear it up and use my veto</button>
              <p className="hint">One veto each. Tearing shows the runner-up.</p>
            </>
          ) : mine ? (
            <p>You've used your veto.</p>
          ) : (
            <p className="hint">You joined after the pick, so you have no veto this round.</p>
          )}
          <div>
            <h2 className="label ink-muted">Vetoes left</h2>
            <ul className="tokens">
              {voters.map((m) => (
                <li key={m.id} className={m.vetoUsed ? "token token-used" : "token"}>
                  {m.nickname}{m.vetoUsed && <span className="label"> used</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
      </div>

      {isHost
        ? <button className="btn-text" type="button" onClick={onReopen}>Back to the lobby</button>
        : <p className="note">The host can reopen the lobby to pick again.</p>}

      <SiteFooter />
    </main>
  );
}

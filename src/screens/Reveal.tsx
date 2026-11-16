import { useState } from "react";
import type { PublicState, You } from "../../shared/protocol";
import { Attribution } from "../components/Attribution";
import "./Reveal.css";

export function Settling() {
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

type Props = { state: PublicState; memberId: string | null; you: You; onReopen: () => void };

export function Reveal({ state, memberId, you, onReopen }: Props) {
  const [broken, setBroken] = useState(false);
  const pick = state.pick;
  if (!pick) return null;
  const isHost = memberId !== null && memberId === state.hostId;
  // Lead with a service this person actually has.
  const service = pick.services.find((s) => you.answers?.serviceIds.includes(s.id)) ?? pick.services[0];
  const reasons = state.members.filter((m) => pick.reasons[m.id]);

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">Admit {reasons.length} · Tonight</span>
      </header>

      <article className="ticket reveal" aria-labelledby="pick-title">
        <div className="ticket-section pick">
          {pick.poster && !broken
            ? <img className="pick-poster" src={pick.poster} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
            : <span className="pick-poster pick-poster-blank" aria-hidden="true">{pick.title}</span>}
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
            {reasons.map((m) => (
              <li key={m.id}><strong>{m.nickname}:</strong> {pick.reasons[m.id]}</li>
            ))}
          </ul>
        </div>
      </article>

      {isHost
        ? <button className="btn-text" type="button" onClick={onReopen}>Back to the lobby</button>
        : <p className="note">The host can reopen the lobby to pick again.</p>}

      <footer className="landing-footer"><Attribution /></footer>
    </main>
  );
}

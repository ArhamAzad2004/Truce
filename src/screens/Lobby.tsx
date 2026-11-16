import { useMemo, useState } from "react";
import { encode } from "uqr";
import { LIMITS } from "../../shared/limits";
import type { PublicState } from "../../shared/protocol";
import "./Lobby.css";

function Qr({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(text, { border: 1 });
    let path = "";
    data.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
    return { path, size };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code for the invite link">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

const regionName = (code: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; } catch { return code; }
};

type Props = { state: PublicState; memberId: string | null; reconnecting: boolean };

export function Lobby({ state, memberId, reconnecting }: Props) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const link = `${location.origin}/r/${state.code}`;
  const isHost = memberId !== null && memberId === state.hostId;
  const seated = state.members.length;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied("yes"); } catch { setCopied("failed"); }
    setTimeout(() => setCopied(null), 2500);
  };
  const share = () => { navigator.share({ title: "Truce", text: "Join my Truce room.", url: link }).catch(() => {}); };

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">{isHost ? "Host" : "Guest"}</span>
      </header>

      {reconnecting && <p className="strip" role="status">Lost the signal. Reconnecting…</p>}

      <h1 className="title">Box office is open.</h1>

      <section className="ticket" aria-label="Invite">
        <div className="ticket-section stack">
          <div>
            <span className="label ink-muted">Room no.</span>
            <p className="room-code">{state.code.slice(0, 5)} {state.code.slice(5)}</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={copy}>Copy invite link</button>
          {"share" in navigator && <button className="btn btn-ghost" type="button" onClick={share}>Share</button>}
          <p className="hint" role="status">
            {copied === "yes" && "Link copied."}
            {copied === "failed" && "Couldn't copy. The link is in your address bar."}
          </p>
        </div>
        <div className="perf" aria-hidden="true" />
        <div className="ticket-section qr-stub"><Qr text={link} /></div>
      </section>

      <p className="note">Scan or share. Nickname only, no account.</p>
      <p className="note">Streaming region: {regionName(state.region)}</p>

      <section className="ticket" aria-label="Seats">
        <div className="ticket-section stack">
          <span className="label ink-muted">Row A · {seated} of {LIMITS.members} seats taken</span>
          <ul className="seats" aria-live="polite">
            {state.members.map((m, i) => (
              <li key={m.id} className={m.connected ? "seat-row" : "seat-row away"}>
                <span className="seat label" aria-hidden="true">A{i + 1}</span>
                <span className="seat-name">{m.nickname}</span>
                {m.id === memberId && <span className="tag label">you</span>}
                {m.id === state.hostId && <span className="tag label">host</span>}
                <span className="seat-status">{m.connected ? "Seated" : "Away"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="note">Seats are filling. Picks open soon.</p>
    </main>
  );
}

import { useMemo, useState } from "react";
import { encode } from "uqr";
import type { PublicState, Region, You } from "../../shared/protocol";
import type { RoomError } from "../useRoom";
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

function errorCopy(error: RoomError) {
  if (error.code === "QUOTA_REACHED") {
    return `Truce is resting. We've used up ${error.scope === "day" ? "today's film lookups. Back tomorrow." : "this month's film lookups. Back next month."}`;
  }
  if (error.code === "PICK_FAILED") return "The film listings didn't answer. Try again in a minute.";
  return "That didn't save. Try again.";
}

type Props = {
  state: PublicState;
  memberId: string | null;
  you: You;
  error: RoomError | null;
  reconnecting: boolean;
  onPick: () => void;
  onRegion: (region: string) => void;
};

export function Lobby({ state, memberId, you, error, reconnecting, onPick, onRegion }: Props) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [regions, setRegions] = useState<Region[] | "loading" | "failed" | null>(null);
  const link = `${location.origin}/r/${state.code}`;
  const isHost = memberId !== null && memberId === state.hostId;
  const me = state.members.find((m) => m.id === memberId);
  const host = state.members.find((m) => m.id === state.hostId);
  const readyCount = state.members.filter((m) => m.ready).length;
  const regionChanged = you.answers?.serviceIds.length === 0;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied("yes"); } catch { setCopied("failed"); }
    setTimeout(() => setCopied(null), 2500);
  };
  const share = () => { navigator.share({ title: "Truce", text: "Join my Truce room.", url: link }).catch(() => {}); };

  const openRegions = () => {
    setRegions("loading");
    fetch("/api/regions")
      .then((r) => (r.ok ? (r.json() as Promise<Region[]>) : Promise.reject()))
      .then(setRegions, () => setRegions("failed"));
  };

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">{isHost ? "Host" : "Guest"}</span>
      </header>

      {reconnecting && <p className="strip" role="status">Lost the signal. Reconnecting…</p>}
      {error && <p className="strip" role="alert">{errorCopy(error)}</p>}

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

      <div className="region">
        {Array.isArray(regions) ? (
          <label className="region-pick">
            Streaming region
            <select
              className="input input-room" value={state.region} autoFocus
              onChange={(e) => { onRegion(e.target.value); setRegions(null); }}
              onBlur={() => setRegions(null)}
            >
              {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </label>
        ) : (
          <p className="note">
            Streaming region: {regionName(state.region)}
            {isHost && regions !== "loading" && <> · <button className="btn-text btn-inline" type="button" onClick={openRegions}>Change</button></>}
          </p>
        )}
        {regions === "failed" && <p className="note" role="alert">Couldn't load the list of countries. Try again in a moment.</p>}
        {isHost && Array.isArray(regions) && <p className="note">Changing it clears everyone's services and ready stamps.</p>}
      </div>

      <section className="ticket" aria-label="Seats">
        <div className="ticket-section stack">
          <span className="label ink-muted">Row A · {readyCount} of {state.members.length} ready</span>
          <ul className="seats" aria-live="polite">
            {state.members.map((m, i) => (
              <li key={m.id} className={m.connected ? "seat-row" : "seat-row away"}>
                <span className={m.ready ? "seat seat-ready label" : "seat label"} aria-hidden="true">A{i + 1}</span>
                <span className="seat-name">{m.nickname}</span>
                {m.id === memberId && <span className="tag label">you</span>}
                {m.id === state.hostId && <span className="tag label">host</span>}
                {m.ready
                  ? <span className="stamp label">Ready</span>
                  : <span className="seat-status">{m.connected ? "Picking films…" : "Away"}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="stack">
        {regionChanged && <p className="note">The region changed. Pick your services again.</p>}
        {me?.ready
          ? <button className="btn-text" type="button" onClick={onPick}>Change my picks</button>
          : <button className="btn btn-primary" type="button" onClick={onPick}>{you.answers ? "Finish my picks" : "Start my picks"}</button>}
        {isHost ? (
          <>
            {/* shortcut: the pick itself arrives in Phase 6; until then the button only shows when it would open. */}
            <button className="btn btn-primary" type="button" aria-disabled="true">Settle it</button>
            <p className="note">
              {readyCount < 2 ? "Settle it opens when two of you are ready." : "Enough of you are ready. Settling arrives in the next build."}
            </p>
          </>
        ) : me?.ready ? (
          <p className="note">You're in. The host settles it when everyone's ready.</p>
        ) : host && !host.connected ? (
          <p className="note">{host.nickname} stepped out. The room waits for the host to settle it.</p>
        ) : null}
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useRoom } from "../useRoom";
import { Favourites } from "./Favourites";
import { Lobby } from "./Lobby";
import { Nickname } from "./Nickname";
import { QuickTaps } from "./QuickTaps";
import { Reveal, Settling } from "./Reveal";

type NoticeProps = { title: string; body: string; action: string; onAction: () => void };

export function Notice({ title, body, action, onAction }: NoticeProps) {
  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
      </header>
      <h1 className="title">{title}</h1>
      <p>{body}</p>
      <button className="btn btn-primary" type="button" onClick={onAction}>{action}</button>
    </main>
  );
}

export const NoRoom = ({ onOpen }: { onOpen: () => void }) => (
  <Notice title="No room here." body="The link may be wrong, or the room has closed." action="Open a room" onAction={onOpen} />
);

export function Room({ code, go }: { code: string; go: (to: string) => void }) {
  const room = useRoom(code);
  const [view, setView] = useState<"lobby" | "taps" | "films">("lobby");
  const open = () => go("/new");

  // A new screen replaces the old one without a page load, so move focus to its heading for screen readers.
  // Skipped when the screen has put focus in a field of its own (the nickname).
  const screen = `${room.status}:${room.state?.phase}:${view}:${room.state?.pick?.movieId}`;
  useEffect(() => {
    if (document.activeElement instanceof HTMLInputElement) return;
    const heading = document.querySelector("h1");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [screen]);

  switch (room.status) {
    case "joined":
      if (!room.state) return null;
      // The room's phase wins over whatever this person was doing: everyone sees the pick together.
      if (room.state.phase === "settling") return <Settling />;
      if (room.state.phase === "result") {
        return (
          <Reveal
            state={room.state} memberId={room.memberId} you={room.you}
            onVeto={() => room.send({ type: "veto" })} onReopen={() => room.send({ type: "reopen" })}
          />
        );
      }
      if (view === "taps") {
        return (
          <QuickTaps
            you={room.you} region={room.state.region} onBack={() => setView("lobby")}
            onDone={(answers) => { room.send({ type: "setAnswers", ...answers }); setView("films"); }}
          />
        );
      }
      if (view === "films") {
        return (
          <Favourites
            you={room.you} onBack={() => setView("taps")}
            onDone={(ids) => {
              // The room handles messages in order, so these can go back to back.
              room.send({ type: "setFavourites", ids });
              room.send({ type: "setReady", ready: true });
              setView("lobby");
            }}
          />
        );
      }
      return (
        <Lobby
          state={room.state} memberId={room.memberId} you={room.you} error={room.error} reconnecting={room.reconnecting}
          onPick={() => setView("taps")} onRegion={(region) => room.send({ type: "setRegion", region })}
          onSettle={() => room.send({ type: "settle" })}
        />
      );
    case "needName":
      return <Nickname code={code} nameTaken={room.joinError === "NAME_TAKEN"} onSubmit={room.join} />;
    case "notFound":
      return <NoRoom onOpen={open} />;
    case "full":
      return <Notice title="This room is full." body="All eight seats are taken." action="Open a room" onAction={open} />;
    case "expired":
      return <Notice title="The lights are up." body="This room closed after 4 hours. Open a new one to pick again." action="Open a room" onAction={open} />;
    case "late":
      return <Notice title="This room has already settled." body="Ask the host for a new one." action="Open a room" onAction={open} />;
    case "elsewhere":
      return <Notice title="Your seat is open in another tab." body="Carry on there, or bring it back to this one." action="Use this tab" onAction={room.tryAgain} />;
    case "offline":
      return <Notice title="Still can't reach the room." body="Check your connection." action="Try again" onAction={room.tryAgain} />;
    case "connecting":
      return (
        <main className="screen">
          <header className="screen-head"><span className="wordmark" aria-label="Truce">TRUCE</span></header>
          <p className="note" role="status">{room.reconnecting ? "Lost the signal. Reconnecting…" : "Finding your room…"}</p>
        </main>
      );
  }
}

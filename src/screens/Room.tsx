import { useRoom } from "../useRoom";
import { Lobby } from "./Lobby";
import { Nickname } from "./Nickname";

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
  const open = () => go("/new");

  switch (room.status) {
    case "joined":
      return room.state && <Lobby state={room.state} memberId={room.memberId} reconnecting={room.reconnecting} />;
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

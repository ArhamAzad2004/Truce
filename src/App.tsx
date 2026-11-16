import { useCallback, useEffect, useState } from "react";
import { CODE_RE } from "../shared/limits";
import type { CreateRoomResponse } from "../shared/protocol";
import { Landing } from "./screens/Landing";
import { Nickname } from "./screens/Nickname";
import { NoRoom, Room } from "./screens/Room";
import { saveSeat } from "./useRoom";

type Go = (to: string, replace?: boolean) => void;

// The host names themselves first; the room is created when they take their seat.
function NewRoom({ go }: { go: Go }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const create = async (nickname: string) => {
    setBusy(true);
    setFailure(undefined);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (res.status === 503) {
        const { scope } = (await res.json()) as { scope?: string };
        setBusy(false);
        return setFailure(`Truce is resting. We've used up ${scope === "day" ? "today's film lookups. Back tomorrow." : "this month's film lookups. Back next month."}`);
      }
      if (!res.ok) throw new Error(String(res.status));
      const { code, hostToken } = (await res.json()) as CreateRoomResponse;
      saveSeat(code, { hostToken, nickname });
      go(`/r/${code}`, true);
    } catch {
      setBusy(false);
      setFailure("Couldn't open a room. Try again in a moment.");
    }
  };

  return <Nickname busy={busy} failure={failure} onSubmit={create} />;
}

// Three routes, so no router: "/", "/new" and "/r/:code".
export function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback<Go>((to, replace) => {
    history[replace ? "replaceState" : "pushState"](null, "", to);
    setPath(to);
  }, []);

  if (path === "/new") return <NewRoom go={go} />;
  if (path.startsWith("/r/")) {
    const code = path.slice(3).toUpperCase();
    return CODE_RE.test(code) ? <Room key={code} code={code} go={go} /> : <NoRoom onOpen={() => go("/new")} />;
  }
  return <Landing go={go} />;
}

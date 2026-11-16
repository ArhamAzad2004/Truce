import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ErrorCode, PublicState, QuotaScope, ServerMessage, You } from "../shared/protocol";

/** The last thing the room refused, for a line of copy in the lobby. */
export type RoomError = { code: ErrorCode; scope?: QuotaScope };

export type RoomStatus =
  | "connecting" | "needName" | "joined"
  | "notFound" | "full" | "expired" | "late" | "offline";

// Kept per tab in sessionStorage, never in the URL. `hostToken` + `nickname` are a join waiting to be sent.
type Saved = { token?: string; hostToken?: string; nickname?: string };

const key = (code: string) => `truce:${code}`;

export function saveSeat(code: string, seat: Saved) {
  try { sessionStorage.setItem(key(code), JSON.stringify(seat)); } catch { /* private mode: the seat lasts until refresh */ }
}

function loadSeat(code: string): Saved {
  try { return JSON.parse(sessionStorage.getItem(key(code)) ?? "{}") as Saved; } catch { return {}; }
}

const MAX_TRIES = 5;
const EXPIRED_CLOSE = 4000;

export function useRoom(code: string) {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [state, setState] = useState<PublicState | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [you, setYou] = useState<You>({ favourites: [] });
  const [joinError, setJoinError] = useState<ErrorCode | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const url = `${location.origin.replace(/^http/, "ws")}/api/rooms/${code}/ws`;

    const connect = () => {
      const ws = new WebSocket(url);
      socket.current = ws;
      let opened = false;
      let joined = false;
      let final = false; // the server said not to come back

      const stop = (next: RoomStatus) => { final = true; setStatus(next); ws.close(); };

      ws.onopen = () => {
        opened = true;
        const seat = loadSeat(code);
        if (seat.token) ws.send(JSON.stringify({ type: "resume", token: seat.token }));
        else if (seat.hostToken && seat.nickname) ws.send(JSON.stringify({ type: "join", nickname: seat.nickname, hostToken: seat.hostToken }));
        else { tries = 0; setReconnecting(false); setStatus("needName"); }
        ping = setInterval(() => ws.send('{"type":"ping"}'), 30_000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === "welcome") {
          joined = true;
          tries = 0;
          saveSeat(code, { token: msg.token });
          setMemberId(msg.memberId);
          setState(msg.state);
          setYou(msg.you);
          setJoinError(null);
          setReconnecting(false);
          setStatus("joined");
        } else if (msg.type === "state") {
          setState(msg.state);
        } else if (msg.type === "you") {
          setYou(msg.you);
        } else if (msg.type === "error") {
          if (msg.code === "ROOM_FULL") stop("full");
          else if (msg.code === "EXPIRED") stop("expired");
          else if (msg.code === "WRONG_PHASE" && !joined) stop("late");
          else if (msg.code === "NAME_TAKEN") setJoinError(msg.code);
          // A token the room no longer knows: forget it; the reconnect then asks for a name.
          else if (msg.code === "BAD_MESSAGE" && !joined) saveSeat(code, {});
          else if (joined) setError({ code: msg.code, scope: msg.scope });
        }
      };

      ws.onclose = async (event) => {
        clearInterval(ping);
        if (stopped || final) return;
        if (event.code === EXPIRED_CLOSE) return setStatus("expired");
        if (!opened) {
          // A socket can't tell "no such room" from "no network", so ask the same URL over HTTP.
          const probe = await fetch(`/api/rooms/${code}/ws`).catch(() => null);
          if (stopped) return;
          if (probe?.status === 404) return setStatus("notFound");
        }
        if (++tries > MAX_TRIES) return setStatus("offline");
        setReconnecting(true);
        retry = setTimeout(connect, Math.min(1000 * 2 ** (tries - 1), 10_000));
      };
    };

    setStatus("connecting");
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket.current?.close();
    };
  }, [code, attempt]);

  const join = useCallback((nickname: string) => {
    setJoinError(null);
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "join", nickname }));
  }, []);

  const send = useCallback((msg: Exclude<ClientMessage, { type: "join" | "resume" | "ping" }>) => {
    setError(null);
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);

  const tryAgain = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, state, memberId, you, joinError, error, reconnecting, join, send, tryAgain };
}

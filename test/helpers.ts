import { exports } from "cloudflare:workers";
import { afterEach, expect } from "vitest";
import type { CreateRoomResponse, ServerMessage } from "../shared/protocol";

export const BASE = "http://truce.test";
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const ws of sockets.splice(0)) try { ws.close(); } catch { /* already closed */ }
});

export async function createRoom() {
  const res = await exports.default.fetch(`${BASE}/api/rooms`, { method: "POST" });
  expect(res.status).toBe(200);
  return (await res.json()) as CreateRoomResponse;
}

export const upgrade = (code: string, origin = BASE) =>
  exports.default.fetch(`${BASE}/api/rooms/${code}/ws`, { headers: { Upgrade: "websocket", Origin: origin } });

export async function open(code: string) {
  const res = await upgrade(code);
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  sockets.push(ws);
  const queue: ServerMessage[] = [];
  const waiters: ((m: ServerMessage) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(msg); else queue.push(msg);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  return {
    ws,
    closed,
    send: (msg: unknown) => ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)),
    /** The next message of one type, skipping the others. */
    until: async function <T extends ServerMessage["type"]>(this: { next(): Promise<ServerMessage> }, type: T) {
      for (;;) { const msg = await this.next(); if (msg.type === type) return msg as Extract<ServerMessage, { type: T }>; }
    },
    next: () => {
      const msg = queue.shift();
      return msg ? Promise.resolve(msg) : new Promise<ServerMessage>((resolve) => waiters.push(resolve));
    },
  };
}

export async function join(code: string, nickname: string, hostToken?: string) {
  const sock = await open(code);
  sock.send({ type: "join", nickname, hostToken });
  const welcome = await sock.next();
  if (welcome.type !== "welcome") throw new Error(`expected welcome, got ${JSON.stringify(welcome)}`);
  return { ...sock, welcome };
}

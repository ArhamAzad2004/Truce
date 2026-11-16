import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { CODE_RE, LIMITS, TOKEN_RE } from "../shared/limits";
import type { CreateRoomResponse, ServerMessage } from "../shared/protocol";

const BASE = "http://truce.test";
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const ws of sockets.splice(0)) try { ws.close(); } catch { /* already closed */ }
});

async function createRoom() {
  const res = await exports.default.fetch(`${BASE}/api/rooms`, { method: "POST" });
  expect(res.status).toBe(200);
  return (await res.json()) as CreateRoomResponse;
}

const upgrade = (code: string, origin = BASE) =>
  exports.default.fetch(`${BASE}/api/rooms/${code}/ws`, { headers: { Upgrade: "websocket", Origin: origin } });

async function open(code: string) {
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
    next: () => {
      const msg = queue.shift();
      return msg ? Promise.resolve(msg) : new Promise<ServerMessage>((resolve) => waiters.push(resolve));
    },
  };
}

async function join(code: string, nickname: string, hostToken?: string) {
  const sock = await open(code);
  sock.send({ type: "join", nickname, hostToken });
  const welcome = await sock.next();
  if (welcome.type !== "welcome") throw new Error(`expected welcome, got ${JSON.stringify(welcome)}`);
  return { ...sock, welcome };
}

describe("rooms", () => {
  it("creates a room with a code and a host token", async () => {
    const { code, hostToken } = await createRoom();
    expect(code).toMatch(CODE_RE);
    expect(hostToken).toMatch(TOKEN_RE);
  });

  it("seats the host with the host token and a guest without it", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    expect(host.welcome.token).toBe(hostToken);
    expect(host.welcome.state.hostId).toBe(host.welcome.memberId);

    const guest = await join(code, "Noor");
    expect(guest.welcome.token).not.toBe(hostToken);
    expect(guest.welcome.state.hostId).toBe(host.welcome.memberId);

    const seen = await host.next();
    expect(seen.type).toBe("state");
    expect(JSON.stringify(seen)).not.toContain(guest.welcome.token);
    if (seen.type === "state") {
      expect(seen.state.members.map((m) => [m.nickname, m.connected])).toEqual([["Sam", true], ["Noor", true]]);
    }
  });

  it("rejects a wrong host token", async () => {
    const { code } = await createRoom();
    const sock = await open(code);
    sock.send({ type: "join", nickname: "Sam", hostToken: "A".repeat(22) });
    expect(await sock.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    expect(await sock.closed).toBe(1008);
  });

  it("refuses a join outside the lobby", async () => {
    const { code } = await createRoom();
    await runInDurableObject(env.ROOM.getByName(code), (_room, state) => {
      state.storage.kv.put("room", { ...state.storage.kv.get<object>("room"), phase: "result" });
    });
    const sock = await open(code);
    sock.send({ type: "join", nickname: "Late" });
    expect(await sock.next()).toEqual({ type: "error", code: "WRONG_PHASE" });
  });

  it("resumes the same member and shows them away in between", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    const guest = await join(code, "Noor");
    await host.next(); // Noor joined

    guest.ws.close();
    const away = await host.next();
    expect(away.type === "state" && away.state.members[1].connected).toBe(false);

    const back = await open(code);
    back.send({ type: "resume", token: guest.welcome.token });
    const welcome = await back.next();
    expect(welcome.type === "welcome" && welcome.memberId).toBe(guest.welcome.memberId);
    expect(welcome.type === "welcome" && welcome.state.members).toHaveLength(2);

    const stranger = await open(code);
    stranger.send({ type: "resume", token: "B".repeat(22) });
    expect(await stranger.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
  });

  it("refuses a duplicate nickname, ignoring case, and lets the socket retry", async () => {
    const { code } = await createRoom();
    await join(code, "Leila");
    const sock = await open(code);
    sock.send({ type: "join", nickname: "  LEILA " });
    expect(await sock.next()).toEqual({ type: "error", code: "NAME_TAKEN" });
    sock.send({ type: "join", nickname: "Leila B" });
    expect((await sock.next()).type).toBe("welcome");
  });

  it("is full at eight members", async () => {
    const { code } = await createRoom();
    for (let i = 1; i <= LIMITS.members; i++) await join(code, `Guest ${i}`);
    const sock = await open(code);
    sock.send({ type: "join", nickname: "Ninth" });
    expect(await sock.next()).toEqual({ type: "error", code: "ROOM_FULL" });
    expect(await sock.closed).toBe(1008);
  });

  it("rejects bad messages: closes on a first frame, stays open once joined", async () => {
    const { code } = await createRoom();
    const fresh = await open(code);
    fresh.send("not json");
    expect(await fresh.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    expect(await fresh.closed).toBe(1008);

    const member = await join(code, "Sam");
    member.send({ type: "dance" });
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    member.send({ type: "join", nickname: "<script>" });
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    member.send(JSON.stringify({ type: "join", nickname: "x".repeat(LIMITS.frameBytes) }));
    expect(await member.next()).toEqual({ type: "error", code: "BAD_MESSAGE" });
    member.send('{"type":"ping"}');
    expect(await member.next()).toEqual({ type: "pong" });
  });

  it("closes a flooding socket", async () => {
    const { code } = await createRoom();
    const member = await join(code, "Sam");
    for (let i = 0; i < LIMITS.floodCount; i++) member.send({ type: "dance" });
    let last: ServerMessage;
    do last = await member.next(); while (last.type === "error" && last.code === "BAD_MESSAGE");
    expect(last).toEqual({ type: "error", code: "RATE_LIMITED" });
  });

  it("expires: tells open sockets, closes them and forgets the room", async () => {
    const { code, hostToken } = await createRoom();
    const host = await join(code, "Sam", hostToken);
    expect(await runDurableObjectAlarm(env.ROOM.getByName(code))).toBe(true);
    expect(await host.next()).toEqual({ type: "error", code: "EXPIRED" });
    expect(await host.closed).toBe(4000);
    expect((await upgrade(code)).status).toBe(404);
  });

  it("guards the socket route", async () => {
    const { code } = await createRoom();
    expect((await upgrade("0000000000")).status).toBe(404); // unknown code
    expect((await upgrade("nope")).status).toBe(400);
    expect((await upgrade(code, "https://evil.example")).status).toBe(403);
    expect((await exports.default.fetch(`${BASE}/api/rooms/${code}/ws`)).status).toBe(426); // existence probe
    expect((await exports.default.fetch(`${BASE}/api/rooms/0000000000/ws`)).status).toBe(404);
  });
});

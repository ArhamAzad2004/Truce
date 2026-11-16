import { DurableObject } from "cloudflare:workers";
import { LIMITS } from "../shared/limits";
import {
  type Answers, ClientMessage, type ErrorCode, type Favourite, type Film, type Notice, type Phase, type PublicState,
  type ServerMessage, type You,
} from "../shared/protocol";
import type { Fail } from "./catalog";
import type { Countries } from "./motn";
import { type Ranked, type Voter, pick } from "./pick";
import { rank } from "./pick/ai";

type Member = {
  nickname: string;
  token: string;
  answers?: Answers;
  favourites: Favourite[];
  ready: boolean;
  vetoUsed: boolean;
};

type RoomState = {
  code: string;
  createdAt: number;
  expiresAt: number;
  region: string;
  phase: Phase;
  hostId: string | null;
  hostToken: string;
  settleAttempts: number;
  notice?: Notice;
  members: Record<string, Member>;
  result?: {
    ranking: Ranked[];
    index: number; // the current pick; a veto moves it on
    pool: Film[]; // remaining candidates in score order
    source: "ai" | "fallback";
    vetoes: { memberId: string; movieId: string }[];
    exhausted: boolean;
  };
};

type Attachment = { memberId: string } | null;
type Seat = Extract<ClientMessage, { type: "join" | "resume" }>;

const EXPIRED_CLOSE = 4000;
const POLICY_CLOSE = 1008;

const randomBase64Url = (bytes: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export const newToken = () => randomBase64Url(16); // 128 bits, 22 chars

const enc = new TextEncoder();
const sameSecret = (a: string, b: string) =>
  a.length === b.length && crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));

const nameKey = (nickname: string) => nickname.toLowerCase();

const you = (m: Member): You => ({
  answers: m.answers,
  favourites: m.favourites.map(({ id, title, year, poster }) => ({ id, title, year, poster })),
});

// A Catalog failure as a socket error. "PICK_FAILED" = the film listings did not answer.
const catalogError = (fail: Fail): ServerMessage =>
  fail.error === "QUOTA_REACHED" ? { type: "error", code: "QUOTA_REACHED", scope: fail.scope } : { type: "error", code: "PICK_FAILED" };

export class Room extends DurableObject<Env> {
  // Flood counters live in memory: they reset when the object sleeps, which only happens when sockets are idle.
  private recent = new WeakMap<WebSocket, number[]>();
  private queue: Promise<void> = Promise.resolve();
  private settling = false; // true only while this instance is running a pick

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private load() {
    const room = this.ctx.storage.kv.get<RoomState>("room");
    // A pick that died with the object (a restart mid-settle) must not leave the room stuck.
    if (room?.phase === "settling" && !this.settling) {
      room.phase = "lobby";
      room.notice = "PICK_FAILED";
      this.save(room);
    }
    return room;
  }
  private save = (room: RoomState) => this.ctx.storage.kv.put("room", room);
  private catalog = () => this.env.CATALOG.getByName("catalog");

  /** Called once by POST /api/rooms. Returns false if the code is already in use. */
  async create(code: string, region: string, hostToken: string): Promise<boolean> {
    if (this.load()) return false;
    const createdAt = Date.now();
    const expiresAt = createdAt + LIMITS.roomTtlMs;
    this.save({
      code, createdAt, expiresAt, region, phase: "lobby",
      hostId: null, hostToken, settleAttempts: 0, members: {},
    });
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    // An unknown or expired code writes nothing and looks the same either way.
    if (!this.load()) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "UPGRADE_REQUIRED" }, { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    let open = this.ctx.getWebSockets();
    if (open.length >= LIMITS.sockets) {
      // Make room by dropping sockets that never joined, so idle connections can't lock members out.
      for (const ws of open) if (!ws.deserializeAttachment()) ws.close(POLICY_CLOSE, "ROOM_FULL");
      open = open.filter((ws) => ws.deserializeAttachment());
    }
    this.ctx.acceptWebSocket(server);
    if (open.length >= LIMITS.sockets) this.reject(server, "ROOM_FULL");
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    // One message at a time for the whole room, so a handler waiting on the Catalog can't be overtaken
    // (for example setReady arriving while setFavourites is still looking films up).
    this.queue = this.queue.then(() => this.handle(ws, raw)).catch(() => console.error("room message failed"));
    await this.queue;
  }

  private async handle(ws: WebSocket, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment;
    if (!this.load()) return ws.close(EXPIRED_CLOSE, "EXPIRED");

    const now = Date.now();
    const times = (this.recent.get(ws) ?? []).filter((t) => now - t < LIMITS.floodWindowMs);
    times.push(now);
    this.recent.set(ws, times);
    if (times.length > LIMITS.floodCount) return this.reject(ws, "RATE_LIMITED");

    const msg = this.parse(raw);
    const bad = () => (att ? this.send(ws, { type: "error", code: "BAD_MESSAGE" }) : this.reject(ws, "BAD_MESSAGE"));
    if (!msg) return bad();
    if (msg.type === "join" || msg.type === "resume") return att ? bad() : this.seat(ws, msg);
    // The first frame must be join or resume.
    if (!att) return bad();
    if (msg.type === "ping") return this.send(ws, { type: "pong" });
    if (msg.type === "settle") return this.settle(ws, att.memberId);
    if (msg.type === "reopen") return this.reopen(ws, att.memberId);

    // Catalog lookups come first: nothing may await between loading the room and saving it.
    let countries: Countries | undefined;
    let films: Favourite[] | undefined;
    if (msg.type === "setAnswers" || msg.type === "setRegion") {
      const result = await this.catalog().countries();
      if (!result.ok) return this.send(ws, catalogError(result));
      countries = result.data;
    } else if (msg.type === "setFavourites") {
      const found = await this.catalog().films(msg.ids);
      // Only films this server has shown in a search are accepted, so this never costs an upstream request.
      if (found.some((f) => !f)) return bad();
      films = found as Favourite[];
    }

    const room = this.load();
    const me = room?.members[att.memberId];
    if (!room || !me) return ws.close(EXPIRED_CLOSE, "EXPIRED");
    const refuse = (code: ErrorCode) => this.send(ws, { type: "error", code });
    if (room.phase !== "lobby") return refuse("WRONG_PHASE");

    let everyone = false; // whose private data changed
    switch (msg.type) {
      case "setAnswers": {
        const offered = new Set(countries![room.region]?.services.map((s) => s.id));
        if (!msg.serviceIds.every((id) => offered.has(id))) return bad();
        const { mood, energy, maxMinutes, serviceIds } = msg;
        me.answers = { mood, energy, maxMinutes, serviceIds };
        me.ready = false;
        break;
      }
      case "setFavourites":
        me.favourites = films!;
        me.ready = false;
        break;
      case "setReady":
        if (msg.ready && !(me.answers?.serviceIds.length && me.favourites.length)) return refuse("WRONG_PHASE");
        me.ready = msg.ready;
        break;
      case "setRegion":
        if (att.memberId !== room.hostId) return refuse("NOT_HOST");
        if (!countries![msg.region]) return bad();
        if (msg.region === room.region) return;
        room.region = msg.region;
        for (const m of Object.values(room.members)) {
          if (m.answers) m.answers.serviceIds = []; // services differ per country
          m.ready = false;
        }
        everyone = true;
        break;
    }

    this.save(room);
    for (const sock of this.ctx.getWebSockets()) {
      const other = sock.deserializeAttachment() as Attachment;
      if (other && (everyone || other.memberId === att.memberId)) this.send(sock, { type: "you", you: you(room.members[other.memberId]) });
    }
    this.broadcast(room);
  }

  /** Host only: run the pick for the ready members. The phase is saved before the first await, so a second settle is refused. */
  private async settle(ws: WebSocket, memberId: string) {
    const refuse = (code: ErrorCode) => this.send(ws, { type: "error", code });
    const room = this.load()!;
    if (memberId !== room.hostId) return refuse("NOT_HOST");
    const voters: Voter[] = Object.entries(room.members)
      .filter(([, m]) => m.ready && m.answers)
      .map(([id, m]) => ({ id, answers: m.answers!, favourites: m.favourites }));
    if (room.phase !== "lobby" || voters.length < LIMITS.minReady || room.settleAttempts >= LIMITS.settleAttempts) {
      return refuse("WRONG_PHASE");
    }

    room.phase = "settling";
    room.settleAttempts += 1;
    delete room.notice;
    this.save(room);
    this.broadcast(room);

    this.settling = true;
    const catalog = this.catalog();
    const outcome = await pick(room.region, voters, (query) => catalog.candidates(query))
      .catch(() => ({ ok: false, notice: "PICK_FAILED" }) as const);
    // No key = the AI step is off (kill switch). Any failure inside it also leaves the deterministic ranking.
    const apiKey = (this.env as { AI_API_KEY?: string }).AI_API_KEY;
    const ai = outcome.ok && apiKey
      ? await rank(outcome.ranking, voters, { apiKey, baseUrl: this.env.AI_BASE_URL, model: this.env.AI_MODEL }).catch(() => null)
      : null;

    const after = this.load(); // the room may have expired while the pick ran
    this.settling = false; // only after loading: `load` treats "settling with no pick running" as a crash
    if (!after || after.phase !== "settling") return;
    if (outcome.ok) {
      after.phase = "result";
      after.result = {
        ranking: ai ?? outcome.ranking, index: 0, pool: outcome.pool,
        source: ai ? "ai" : "fallback", vetoes: [], exhausted: false,
      };
    } else {
      after.phase = "lobby";
      after.notice = outcome.notice;
      refuse(outcome.notice);
    }
    this.save(after);
    this.broadcast(after);
  }

  /** Host only: back to the lobby after a result. Answers and films stay; ready stamps and vetoes are cleared. */
  private reopen(ws: WebSocket, memberId: string) {
    const room = this.load()!;
    if (memberId !== room.hostId) return this.send(ws, { type: "error", code: "NOT_HOST" });
    if (room.phase !== "result") return this.send(ws, { type: "error", code: "WRONG_PHASE" });
    room.phase = "lobby";
    delete room.result;
    for (const m of Object.values(room.members)) { m.ready = false; m.vetoUsed = false; }
    this.save(room);
    this.broadcast(room);
  }

  /** join or resume: attach this socket to a member. Synchronous, so it can't interleave. */
  private seat(ws: WebSocket, msg: Seat) {
    const room = this.load()!;
    let memberId: string | undefined;
    if (msg.type === "resume") {
      memberId = Object.keys(room.members).find((id) => sameSecret(room.members[id].token, msg.token));
      if (!memberId) return this.reject(ws, "BAD_MESSAGE");
    } else {
      const isHost = msg.hostToken !== undefined;
      if (isHost && !sameSecret(room.hostToken, msg.hostToken!)) return this.reject(ws, "BAD_MESSAGE");
      if (isHost && room.hostId) {
        memberId = room.hostId; // a repeated host join (its welcome was lost) takes the same seat back
      } else {
        if (room.phase !== "lobby") return this.send(ws, { type: "error", code: "WRONG_PHASE" });
        const members = Object.values(room.members);
        if (members.length >= LIMITS.members) return this.reject(ws, "ROOM_FULL");
        if (members.some((m) => nameKey(m.nickname) === nameKey(msg.nickname))) {
          return this.send(ws, { type: "error", code: "NAME_TAKEN" });
        }
        memberId = `m_${randomBase64Url(6)}`;
        room.members[memberId] = {
          nickname: msg.nickname,
          token: isHost ? room.hostToken : newToken(),
          favourites: [], ready: false, vetoUsed: false,
        };
        if (isHost) room.hostId = memberId;
        this.save(room);
      }
    }

    ws.serializeAttachment({ memberId } satisfies Attachment);
    const member = room.members[memberId];
    this.send(ws, { type: "welcome", memberId, token: member.token, state: this.publicState(room), you: you(member) });
    this.broadcast(room, ws);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* already closed */ }
    this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.left(ws);
  }

  async alarm() {
    const room = this.load();
    if (room) {
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { type: "error", code: "EXPIRED" });
        ws.close(EXPIRED_CLOSE, "EXPIRED");
      }
    }
    await this.ctx.storage.deleteAll();
  }

  private left(ws: WebSocket) {
    const room = this.load();
    if (room && ws.deserializeAttachment()) this.broadcast(room, undefined, ws);
  }

  private parse(raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > LIMITS.frameBytes || enc.encode(raw).length > LIMITS.frameBytes) return null;
    try {
      const parsed = ClientMessage.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private publicState(room: RoomState, gone?: WebSocket): PublicState {
    const connected = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att && ws !== gone) connected.add(att.memberId);
    }
    const pick = room.result?.ranking[room.result.index];
    return {
      code: room.code, region: room.region, phase: room.phase, expiresAt: room.expiresAt, hostId: room.hostId,
      members: Object.entries(room.members).map(([id, m]) => ({
        id, nickname: m.nickname, ready: m.ready, connected: connected.has(id), vetoUsed: m.vetoUsed,
      })),
      settlesLeft: LIMITS.settleAttempts - room.settleAttempts,
      notice: room.notice,
      // Only the current pick leaves the room: never the rest of the ranking, the pool, ratings or cast.
      pick: pick && {
        movieId: pick.movieId, title: pick.title, year: pick.year, poster: pick.poster,
        runtime: pick.runtime, services: pick.services, reasons: pick.reasons,
      },
      exhausted: room.result?.exhausted || undefined,
    };
  }

  /** Full snapshot to every joined socket except `skip`; `gone` is a socket that is closing. */
  private broadcast(room: RoomState, skip?: WebSocket, gone?: WebSocket) {
    const frame = JSON.stringify({ type: "state", state: this.publicState(room, gone) } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === gone || ws === skip || !ws.deserializeAttachment()) continue;
      try { ws.send(frame); } catch { /* socket is closing */ }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket is closing */ }
  }

  private reject(ws: WebSocket, code: ErrorCode) {
    this.send(ws, { type: "error", code });
    ws.close(POLICY_CLOSE, code);
  }
}

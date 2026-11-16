import { DurableObject } from "cloudflare:workers";
import { LIMITS } from "../shared/limits";
import { ClientMessage, type ErrorCode, type Phase, type PublicState, type ServerMessage } from "../shared/protocol";

type Member = { nickname: string; token: string; favourites: []; ready: boolean; vetoUsed: boolean };

type RoomState = {
  code: string;
  createdAt: number;
  expiresAt: number;
  region: string;
  phase: Phase;
  hostId: string | null;
  hostToken: string;
  settleAttempts: number;
  members: Record<string, Member>;
};

type Attachment = { memberId: string } | null;

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

export class Room extends DurableObject<Env> {
  // Flood counters live in memory: they reset when the object sleeps, which only happens when sockets are idle.
  private recent = new WeakMap<WebSocket, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private load = () => this.ctx.storage.kv.get<RoomState>("room");
  private save = (room: RoomState) => this.ctx.storage.kv.put("room", room);

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
    const att = ws.deserializeAttachment() as Attachment;
    const room = this.load();
    if (!room) return ws.close(EXPIRED_CLOSE, "EXPIRED");

    const now = Date.now();
    const times = (this.recent.get(ws) ?? []).filter((t) => now - t < LIMITS.floodWindowMs);
    times.push(now);
    this.recent.set(ws, times);
    if (times.length > LIMITS.floodCount) return this.reject(ws, "RATE_LIMITED");

    const msg = this.parse(raw);
    if (!msg) return att ? this.send(ws, { type: "error", code: "BAD_MESSAGE" }) : this.reject(ws, "BAD_MESSAGE");

    if (msg.type === "ping") return att ? this.send(ws, { type: "pong" }) : this.reject(ws, "BAD_MESSAGE");
    // join and resume are only valid as the first frame; the first frame must be one of them.
    if (att) return this.send(ws, { type: "error", code: "BAD_MESSAGE" });

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
    const state = this.publicState(room);
    this.send(ws, { type: "welcome", memberId, token: room.members[memberId].token, state, you: { favourites: [] } });
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
    return {
      code: room.code, region: room.region, phase: room.phase, expiresAt: room.expiresAt, hostId: room.hostId,
      members: Object.entries(room.members).map(([id, m]) => ({
        id, nickname: m.nickname, ready: m.ready, connected: connected.has(id), vetoUsed: m.vetoUsed,
      })),
    };
  }

  /** Full snapshot to every joined socket except `skip`; `gone` is a socket that is closing. */
  private broadcast(room: RoomState, skip?: WebSocket, gone?: WebSocket) {
    const frame = JSON.stringify({ type: "state", state: this.publicState(room, gone) } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === gone || !ws.deserializeAttachment()) continue;
      if (ws === skip) continue;
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

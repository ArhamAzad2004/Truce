// WebSocket and API contract. Source of truth for docs/BACKEND_SCHEMA.md; change both together.
// The browser imports types only from here, so zod stays out of the client bundle.
import { z } from "zod";
import { NICKNAME_RE, TOKEN_RE, cleanNickname } from "./limits";

const token = z.string().regex(TOKEN_RE);

export const ClientMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("join"),
    nickname: z.string().max(80).transform(cleanNickname).pipe(z.string().regex(NICKNAME_RE)),
    hostToken: token.optional(),
  }),
  z.strictObject({ type: z.literal("resume"), token }),
  z.strictObject({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Phase = "lobby" | "settling" | "result" | "closed";

export type ErrorCode =
  | "BAD_MESSAGE" | "ROOM_FULL" | "NAME_TAKEN" | "NOT_HOST" | "WRONG_PHASE" | "RATE_LIMITED" | "EXPIRED";

export type PublicState = {
  code: string;
  region: string;
  phase: Phase;
  expiresAt: number;
  hostId: string | null;
  members: { id: string; nickname: string; ready: boolean; connected: boolean; vetoUsed: boolean }[];
};

export type ServerMessage =
  | { type: "welcome"; memberId: string; token: string; state: PublicState; you: { favourites: [] } }
  | { type: "state"; state: PublicState }
  | { type: "error"; code: ErrorCode }
  | { type: "pong" };

export type CreateRoomResponse = { code: string; hostToken: string };

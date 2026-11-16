// WebSocket and API contract. Source of truth for docs/BACKEND_SCHEMA.md; change both together.
// The browser imports types only from here, so zod stays out of the client bundle.
import { z } from "zod";
import { FILM_ID_RE, LIMITS, NICKNAME_RE, SERVICE_ID_RE, TOKEN_RE, cleanNickname } from "./limits";

const token = z.string().regex(TOKEN_RE);
const distinct = (ids: string[]) => new Set(ids).size === ids.length;

export const MOODS = ["cosy", "funny", "tense", "moving", "mind_bending", "feel_good"] as const;
export const ENERGIES = ["half_asleep", "awake", "wired"] as const;
export const MAX_MINUTES = [90, 120, 150, null] as const;

const Answers = z.strictObject({
  mood: z.enum(MOODS),
  energy: z.enum(ENERGIES),
  maxMinutes: z.union([z.literal(90), z.literal(120), z.literal(150), z.null()]),
  serviceIds: z.array(z.string().regex(SERVICE_ID_RE)).min(1).max(LIMITS.services).refine(distinct),
});
export type Answers = z.infer<typeof Answers>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("join"),
    nickname: z.string().max(80).transform(cleanNickname).pipe(z.string().regex(NICKNAME_RE)),
    hostToken: token.optional(),
  }),
  z.strictObject({ type: z.literal("resume"), token }),
  z.strictObject({ type: z.literal("setAnswers"), ...Answers.shape }),
  z.strictObject({
    type: z.literal("setFavourites"),
    ids: z.array(z.string().regex(FILM_ID_RE)).min(1).max(LIMITS.favourites).refine(distinct),
  }),
  z.strictObject({ type: z.literal("setReady"), ready: z.boolean() }),
  z.strictObject({ type: z.literal("setRegion"), region: z.string().regex(/^[A-Z]{2}$/) }),
  z.strictObject({ type: z.literal("settle") }),
  z.strictObject({ type: z.literal("veto") }),
  z.strictObject({ type: z.literal("reopen") }),
  z.strictObject({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Phase = "lobby" | "settling" | "result" | "closed";
export type QuotaScope = "day" | "month";

export type ErrorCode =
  | "BAD_MESSAGE" | "ROOM_FULL" | "NAME_TAKEN" | "NOT_HOST" | "WRONG_PHASE" | "RATE_LIMITED" | "EXPIRED"
  | "VETO_USED" | "NO_CANDIDATES" | "PICK_FAILED" | "QUOTA_REACHED";

/** Why the last settle failed. Everyone sees it; cleared when the next settle starts. */
export type Notice = "NO_CANDIDATES" | "PICK_FAILED" | "QUOTA_REACHED";

export type Service = { id: string; name: string };
export type Region = { code: string; name: string };

/** What a search row shows. */
export type FilmRow = { id: string; title: string; year: number | null; poster: string | null };
/** What the room keeps for a favourite; copied from the Catalog, never from the client. */
export type Favourite = FilmRow & { genres: string[]; directors: string[]; cast: string[] };

/** One candidate, already trimmed. `services` = subscription or free options in the room's region. */
export type Film = {
  movieId: string; title: string; year: number; poster: string | null;
  runtime: number; rating: number; genres: string[]; directors: string[]; cast: string[];
  services: Service[];
};

/** The current pick as clients see it. `reasons` is keyed by member id. */
export type PickView = {
  movieId: string; title: string; year: number; poster: string | null;
  runtime: number; services: Service[]; reasons: Record<string, string>;
};

export type PublicState = {
  code: string;
  region: string;
  phase: Phase;
  expiresAt: number;
  hostId: string | null;
  members: { id: string; nickname: string; ready: boolean; connected: boolean; vetoUsed: boolean }[];
  settlesLeft: number;
  notice?: Notice;
  pick?: PickView;
  vetoedBy?: string; // member id of the latest veto, for "Leila tore it up"
  exhausted?: boolean; // every streamable candidate has been vetoed; `pick` is then absent
};

/** A member's own private data. Only ever sent to that member. */
export type You = { answers?: Answers; favourites: FilmRow[] };

export type ServerMessage =
  | { type: "welcome"; memberId: string; token: string; state: PublicState; you: You }
  | { type: "state"; state: PublicState }
  | { type: "you"; you: You }
  | { type: "error"; code: ErrorCode; scope?: QuotaScope }
  | { type: "pong" };

export type CreateRoomResponse = { code: string; hostToken: string };

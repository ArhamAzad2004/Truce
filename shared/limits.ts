// Limits and formats shared by the Worker and the browser. Mirrors docs/BACKEND_SCHEMA.md §5.
export const LIMITS = {
  members: 8,
  sockets: 12,
  frameBytes: 2048,
  floodCount: 20,
  floodWindowMs: 10_000,
  roomTtlMs: 4 * 60 * 60 * 1000,
} as const;

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const NICKNAME_RE = /^[\p{L}\p{N} \-_']{1,20}$/u;

export const cleanNickname = (raw: string) => raw.normalize("NFKC").trim();

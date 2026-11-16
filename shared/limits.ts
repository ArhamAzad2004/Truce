// Limits and formats shared by the Worker and the browser. Mirrors docs/BACKEND_SCHEMA.md §5.
export const LIMITS = {
  members: 8,
  sockets: 12,
  frameBytes: 2048,
  floodCount: 20,
  floodWindowMs: 10_000,
  roomTtlMs: 4 * 60 * 60 * 1000,
  favourites: 3,
  services: 12,
  searchMin: 3,
  searchMax: 60,
  searchResults: 8,
} as const;

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const NICKNAME_RE = /^[\p{L}\p{N} \-_']{1,20}$/u;
export const FILM_ID_RE = /^[a-z0-9]{1,16}$/i;
export const SERVICE_ID_RE = /^[a-z0-9]{2,20}$/;

export const cleanNickname = (raw: string) => raw.normalize("NFKC").trim();
export const cleanQuery = (raw: string) => raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

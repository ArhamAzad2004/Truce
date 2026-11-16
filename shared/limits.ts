// Limits and formats shared by the Worker and the browser. Mirrors docs/BACKEND_SCHEMA.md §5.
export const LIMITS = {
  members: 8,
  sockets: 18, // 8 members x 2 tabs, plus room for a couple of stale sockets after a network switch
  frameBytes: 2048,
  floodCount: 20,
  floodWindowMs: 10_000,
  roomTtlMs: 4 * 60 * 60 * 1000,
  favourites: 3,
  services: 12,
  searchMin: 3,
  searchMax: 60,
  searchResults: 8,
  settleAttempts: 5,
  minReady: 2,
  reasonChars: 140,
  socketsPerMember: 2,
  // Per client address: [requests, window in ms] (docs/BACKEND_SCHEMA.md §3).
  // The daily budgets stop one person from draining the film allowance that everyone shares.
  rate: {
    rooms: [5, 60_000], sockets: [20, 60_000], listings: [30, 60_000],
    roomsDay: [6, 86_400_000], newSearchesDay: [25, 86_400_000], settlesDay: [10, 86_400_000],
  },
} as const;

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const NICKNAME_RE = /^[\p{L}\p{N} \-_']{1,20}$/u;
export const FILM_ID_RE = /^[a-z0-9]{1,16}$/i;
export const SERVICE_ID_RE = /^[a-z0-9]{2,20}$/;

export const cleanNickname = (raw: string) => raw.normalize("NFKC").trim();
export const cleanQuery = (raw: string) => raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

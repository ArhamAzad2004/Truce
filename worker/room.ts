import { DurableObject } from "cloudflare:workers";

// One instance per room: state machine, sockets and expiry. Built in Phase 4.
export class Room extends DurableObject<Env> {}

import { DurableObject } from "cloudflare:workers";

// Singleton: the only caller of the Streaming Availability API, holds the cache and quota counters. Built in Phase 5.
export class Catalog extends DurableObject<Env> {}

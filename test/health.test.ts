import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("api", () => {
  it("reports health", async () => {
    const res = await exports.default.fetch("http://truce.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects other methods on health", async () => {
    const res = await exports.default.fetch("http://truce.test/api/health", { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("returns JSON 404 for unknown api routes", async () => {
    const res = await exports.default.fetch("http://truce.test/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });
});

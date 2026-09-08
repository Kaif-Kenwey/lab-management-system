import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows N requests within the window then blocks the N+1th", () => {
    const key = "test:allow-n:" + Math.random().toString(36).slice(2);
    const limit = 5;
    for (let i = 0; i < limit; i++) {
      const res = rateLimit(key, limit, 60_000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(limit - i - 1);
    }
    const blocked = rateLimit(key, limit, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports retryAfterSec >= 1 when blocked", () => {
    const key = "test:retry:" + Math.random().toString(36).slice(2);
    rateLimit(key, 1, 60_000);
    const blocked = rateLimit(key, 1, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("different keys are independent buckets", () => {
    const keyA = "test:key-a:" + Math.random().toString(36).slice(2);
    const keyB = "test:key-b:" + Math.random().toString(36).slice(2);
    expect(rateLimit(keyA, 1, 60_000).allowed).toBe(true);
    expect(rateLimit(keyA, 1, 60_000).allowed).toBe(false);
    // key B is unaffected by key A's exhaustion
    expect(rateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });

  it("stops counting hits once blocked (bucket not extended while blocked)", () => {
    const key = "test:no-extend:" + Math.random().toString(36).slice(2);
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    const firstBlock = rateLimit(key, 2, 60_000);
    expect(firstBlock.allowed).toBe(false);
    // Blocked attempts should not push new timestamps — the retry window is
    // governed by the oldest recorded hit, so it stays ~60s away, not growing.
    const retry1 = firstBlock.retryAfterSec;
    const secondBlock = rateLimit(key, 2, 60_000);
    expect(secondBlock.retryAfterSec).toBeLessThanOrEqual(retry1);
  });
});

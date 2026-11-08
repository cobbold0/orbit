import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("Rate Limiter Security Module", () => {
  it("allows requests within configured threshold", () => {
    const key = `test_user_${Date.now()}:action`;
    const res1 = checkRateLimit(key, 3, 10_000);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = checkRateLimit(key, 3, 10_000);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = checkRateLimit(key, 3, 10_000);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("blocks requests that exceed configured limit", () => {
    const key = `test_blocked_${Date.now()}:action`;
    checkRateLimit(key, 2, 10_000);
    checkRateLimit(key, 2, 10_000);

    const blocked = checkRateLimit(key, 2, 10_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("isolates rate limit buckets across different users", () => {
    const userA = `user_a_${Date.now()}:action`;
    const userB = `user_b_${Date.now()}:action`;

    checkRateLimit(userA, 1, 10_000);
    expect(checkRateLimit(userA, 1, 10_000).success).toBe(false);

    // user B should still be allowed
    expect(checkRateLimit(userB, 1, 10_000).success).toBe(true);
  });
});

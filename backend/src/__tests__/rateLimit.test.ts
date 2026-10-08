import { describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";
import { rateLimit } from "../middleware/rateLimit";

const req = (ip: string) => ({ ip }) as Request;
const res = () => ({ setHeader: vi.fn() }) as unknown as Response;

describe("rateLimit", () => {
  it("allows up to `max` requests, then answers 429", () => {
    const limiter = rateLimit({ max: 2, windowMs: 60_000 });
    const next = vi.fn();

    limiter(req("1.1.1.1"), res(), next);
    limiter(req("1.1.1.1"), res(), next);
    expect(next).toHaveBeenCalledTimes(2);

    expect(() => limiter(req("1.1.1.1"), res(), next)).toThrowError(/Too many requests/);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("counts each client separately", () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const next = vi.fn();
    limiter(req("1.1.1.1"), res(), next);
    limiter(req("2.2.2.2"), res(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh window once the old one expires", () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ max: 1, windowMs: 1_000 });
    const next = vi.fn();

    limiter(req("1.1.1.1"), res(), next);
    vi.advanceTimersByTime(1_500);
    limiter(req("1.1.1.1"), res(), next);
    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("tells the client when to retry", () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const response = res();
    limiter(req("9.9.9.9"), res(), vi.fn());
    expect(() => limiter(req("9.9.9.9"), response, vi.fn())).toThrow();
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "../src/lib/chat/rateLimiter.ts";

test("allows up to the limit, then blocks (boundaries: limit and limit + 1)", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
});

test("tracks each key separately", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
  assert.equal(limiter.allow("b"), true);
});

test("starts a new window once the old one has expired", () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  assert.equal(limiter.allow("a"), true);
  time = 999;
  assert.equal(limiter.allow("a"), false);
  time = 1000;
  assert.equal(limiter.allow("a"), true);
});

test("sweeps expired windows when many keys have been seen", () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  for (let i = 0; i < 10_001; i++) limiter.allow(`key${i}`);
  time = 2000;
  assert.equal(limiter.allow("key0"), true);
});

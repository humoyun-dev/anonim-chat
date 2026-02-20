const test = require("node:test");
const assert = require("node:assert/strict");

const { createSpamGuard } = require("../lib/spamGuard");

test("spamGuard blocks banned words (case-insensitive)", () => {
  const guard = createSpamGuard({ bannedWords: ["SpamPhrase"] });
  assert.equal(guard.isSpam({ text: "hello spamphrase", userId: 1, now: 0 }), true);
  assert.equal(guard.isSpam({ text: "ok", userId: 1, now: 1 }), false);
});

test("spamGuard rate limits per user within time window", () => {
  const guard = createSpamGuard({ bannedWords: [], windowMs: 10_000, maxMessages: 2 });

  assert.equal(guard.isSpam({ text: "", userId: 1, now: 0 }), false);
  assert.equal(guard.isSpam({ text: "", userId: 1, now: 1000 }), false);
  assert.equal(guard.isSpam({ text: "", userId: 1, now: 2000 }), true);

  // Another user unaffected
  assert.equal(guard.isSpam({ text: "", userId: 2, now: 2000 }), false);
});

test("spamGuard cleanup removes stale users", () => {
  const guard = createSpamGuard({ bannedWords: [], staleMs: 1000 });
  guard.isSpam({ text: "", userId: 1, now: 0 });
  guard.cleanup(2001);
  assert.equal(guard.isSpam({ text: "", userId: 1, now: 2002 }), false);
});


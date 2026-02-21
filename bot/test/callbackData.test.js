const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCallbackData } = require("../lib/callbackData");

test("parseCallbackData parses known callback payloads", () => {
  assert.deepEqual(parseCallbackData("cancel_reply"), { type: "cancel_reply" });
  assert.deepEqual(parseCallbackData("lang:uz"), { type: "lang", lang: "uz" });
  assert.deepEqual(parseCallbackData("reveal:507f1f77bcf86cd799439011"), {
    type: "reveal",
    messageId: "507f1f77bcf86cd799439011",
  });
  assert.deepEqual(parseCallbackData("reply:123"), {
    type: "reply",
    anonUserId: 123,
  });
  assert.deepEqual(parseCallbackData("ask:123"), {
    type: "ask",
    ownerId: 123,
  });
  assert.deepEqual(parseCallbackData("close:123"), {
    type: "close",
    anonUserId: 123,
  });
  assert.deepEqual(parseCallbackData("repeat:123"), {
    type: "repeat",
    anonUserId: 123,
  });
  assert.deepEqual(parseCallbackData("menu:getlink"), {
    type: "menu",
    action: "getlink",
  });
  assert.deepEqual(parseCallbackData("menu:main"), {
    type: "menu",
    action: "main",
  });
});

test("parseCallbackData returns null for invalid payloads", () => {
  assert.equal(parseCallbackData(null), null);
  assert.equal(parseCallbackData(""), null);
  assert.equal(parseCallbackData("unknown:1"), null);
  assert.equal(parseCallbackData("ask:not-a-number"), null);
  assert.equal(parseCallbackData("lang:"), null);
  assert.equal(parseCallbackData("reveal:"), null);
  assert.equal(parseCallbackData("reply:"), null);
});

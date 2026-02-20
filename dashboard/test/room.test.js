const test = require("node:test");
const assert = require("node:assert/strict");

const { getRoomKey } = require("../lib/room");

test("getRoomKey is stable regardless of order", () => {
  assert.equal(getRoomKey(10, 2), "2_10");
  assert.equal(getRoomKey(2, 10), "2_10");
});


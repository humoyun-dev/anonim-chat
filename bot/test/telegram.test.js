const test = require("node:test");
const assert = require("node:assert/strict");

const { getMessageKind, getSpamText, isValidMongoId } = require("../lib/telegram");

test("isValidMongoId validates 24-hex ids", () => {
  assert.equal(isValidMongoId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidMongoId("507f1f77bcf86cd79943901"), false);
  assert.equal(isValidMongoId("zz7f1f77bcf86cd799439011"), false);
  assert.equal(isValidMongoId(""), false);
  assert.equal(isValidMongoId(null), false);
});

test("getMessageKind detects common telegram message types", () => {
  assert.equal(getMessageKind({ text: "hi" }), "text");
  assert.equal(getMessageKind({ photo: [{ file_id: "x" }] }), "photo");
  assert.equal(getMessageKind({ video: { file_id: "x" } }), "video");
  assert.equal(getMessageKind({ document: { file_id: "x" } }), "document");
  assert.equal(getMessageKind({ sticker: { file_id: "x" } }), "sticker");
  assert.equal(getMessageKind({}), "unknown");
  assert.equal(getMessageKind(null), "unknown");
});

test("getSpamText prefers text over caption", () => {
  assert.equal(getSpamText({ text: "a", caption: "b" }), "a");
  assert.equal(getSpamText({ caption: "b" }), "b");
  assert.equal(getSpamText({}), "");
  assert.equal(getSpamText(null), "");
});


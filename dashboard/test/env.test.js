const test = require("node:test");
const assert = require("node:assert/strict");

const { isStrongPassword, loadDashboardConfig } = require("../lib/env");

test("isStrongPassword enforces minimal complexity", () => {
  assert.equal(isStrongPassword("short"), false);
  assert.equal(isStrongPassword("alllowercase12345"), false);
  assert.equal(isStrongPassword("ALLUPPERCASE12345"), false);
  assert.equal(isStrongPassword("NoDigitsHere!!!!!"), false);
  assert.equal(isStrongPassword("StrongPass12345"), true);
});

test("loadDashboardConfig requires secrets in production", () => {
  assert.throws(
    () =>
      loadDashboardConfig({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://localhost:27017/x",
      }),
    /Missing required env/
  );

  assert.throws(
    () =>
      loadDashboardConfig({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://localhost:27017/x",
        SESSION_SECRET: "secret",
        ADMIN_USER: "admin",
        ADMIN_PASS: "weakpass123",
      }),
    /ADMIN_PASS is too weak/
  );
});


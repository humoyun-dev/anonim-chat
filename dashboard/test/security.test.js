const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

function extractCsrfToken(html) {
  const match = /name="_csrf"\s+value="([^"]+)"/i.exec(String(html || ""));
  if (!match) throw new Error("CSRF token not found in HTML");
  return match[1];
}

function loadApp() {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/anonim_chat_test";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "StrongPass12345";

  // Fresh app per test (also resets rate-limit memory store).
  delete require.cache[require.resolve("../adminDashboard")];
  return require("../adminDashboard").app;
}

test("POST /login without CSRF token redirects to login", async () => {
  const app = loadApp();
  const agent = request.agent(app);

  await agent.get("/login").expect(200);

  await agent
    .post("/login")
    .type("form")
    .send({ username: "admin", password: "StrongPass12345" })
    .expect(302)
    .expect("location", "/login");
});

test("POST /login with CSRF token succeeds", async () => {
  const app = loadApp();
  const agent = request.agent(app);

  const res = await agent.get("/login").expect(200);
  const csrfToken = extractCsrfToken(res.text);

  await agent
    .post("/login")
    .type("form")
    .send({ _csrf: csrfToken, username: "admin", password: "StrongPass12345" })
    .expect(302);
});

test("POST /login is rate limited after 10 attempts", async () => {
  const app = loadApp();
  const agent = request.agent(app);

  const res = await agent.get("/login").expect(200);
  const csrfToken = extractCsrfToken(res.text);

  for (let i = 0; i < 10; i += 1) {
    await agent
      .post("/login")
      .type("form")
      .send({ _csrf: csrfToken, username: "admin", password: "wrong" })
      .expect(200);
  }

  const last = await agent
    .post("/login")
    .type("form")
    .send({ _csrf: csrfToken, username: "admin", password: "wrong" })
    .expect(429);

  assert.match(last.text, /Too many requests/i);
});

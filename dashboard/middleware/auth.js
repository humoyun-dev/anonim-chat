const session = require("express-session");
const MongoStore = require("connect-mongo");
const nodeCrypto = require("node:crypto");

function safeEqual(a, b) {
  const strA = String(a || "");
  const strB = String(b || "");
  const len = Math.max(strA.length, strB.length, 1);
  const bufA = Buffer.from(strA.padEnd(len));
  const bufB = Buffer.from(strB.padEnd(len));
  const equal = nodeCrypto.timingSafeEqual(bufA, bufB);
  return equal && strA.length === strB.length;
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.redirect("/login");
}

function createSessionMiddleware(config) {
  const isTest = config.nodeEnv === "test";
  const mongoUri = config.mongoUri;

  const sessionStore = isTest
    ? undefined
    : MongoStore.create({
        mongoUrl: mongoUri,
        collectionName: "webSessions",
        ttl: 7 * 24 * 60 * 60,
        autoRemove: "native",
      });

  const resolvedSessionSecret = config.sessionSecret || "dev-session-secret";
  if (!config.sessionSecret) {
    console.warn("SESSION_SECRET is not set. Using an insecure dev default.");
  }

  return session({
    name: "anonim.sid",
    secret: resolvedSessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure !== undefined ? config.cookieSecure : false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

function csrfMiddleware(req, res, next) {
  if (req.path.startsWith("/socket.io")) return next();
  if (!req.session) return res.status(500).send("Session not initialized.");

  if (!req.session.csrfToken) {
    req.session.csrfToken = nodeCrypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;

  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS")
    return next();

  const token =
    (req.body && req.body._csrf) ||
    req.headers["x-csrf-token"] ||
    req.headers["x-xsrf-token"];
  if (!token || !safeEqual(token, req.session.csrfToken)) {
    return res.redirect("/login");
  }
  return next();
}

module.exports = {
  safeEqual,
  isAuthenticated,
  createSessionMiddleware,
  csrfMiddleware,
};

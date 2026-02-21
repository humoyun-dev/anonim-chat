const express = require("express");
const nodeCrypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const { safeEqual } = require("../middleware/auth");

function createAuthRouter(config) {
  const router = express.Router();

  const ADMIN_USER = config.adminUser || "admin";
  const ADMIN_PASS = config.adminPass || "password";
  if (!config.adminUser || !config.adminPass) {
    console.warn(
      "ADMIN_USER/ADMIN_PASS is not set. Using insecure dev defaults.",
    );
  }

  router.get("/login", (req, res) => res.render("login", { error: null }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post("/login", loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const ok =
      safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS);
    if (ok) {
      return req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.status(500).render("login", { error: "Login failed" });
        }
        req.session.loggedIn = true;
        req.session.csrfToken = nodeCrypto.randomBytes(32).toString("hex");
        req.session.save((saveErr) => {
          if (saveErr) console.error("Session save error:", saveErr);
          return res.redirect("/chat");
        });
      });
    }
    console.warn("Admin login failed", {
      ip: req.ip,
      username: String(username || ""),
    });
    return res.render("login", { error: "Invalid credentials" });
  });

  router.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
  });

  return router;
}

module.exports = { createAuthRouter };

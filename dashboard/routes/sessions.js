const express = require("express");
const { isAuthenticated } = require("../middleware/auth");

function createSessionsRouter(models) {
  const router = express.Router();
  const { User, SessionModel } = models;

  router.get("/sessions", isAuthenticated, async (req, res) => {
    try {
      const sessions = await SessionModel.find({}).lean();
      const allUserIds = new Set();
      for (const s of sessions) {
        allUserIds.add(s.anonUserId);
        allUserIds.add(s.ownerId);
      }
      const users = await User.find({
        userId: { $in: Array.from(allUserIds) },
      }).lean();
      const usersById = Object.fromEntries(users.map((u) => [u.userId, u]));
      res.render("sessions", {
        title: "Sessions",
        active: "sessions",
        sessions,
        usersById,
      });
    } catch (err) {
      console.error("Sessions fetch error:", err);
      res.status(500).render("error", {
        title: "Error",
        active: "sessions",
        message: "Error retrieving sessions.",
      });
    }
  });

  router.post(
    "/session/:anonUserId/delete",
    isAuthenticated,
    async (req, res) => {
      try {
        await SessionModel.deleteOne({
          anonUserId: parseInt(req.params.anonUserId, 10),
        });
        res.redirect("/sessions?flash=session_deleted");
      } catch (err) {
        console.error("Session delete error:", err);
        res.redirect("/sessions?flash=error");
      }
    },
  );

  return router;
}

module.exports = { createSessionsRouter };

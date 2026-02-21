const express = require("express");
const { isAuthenticated } = require("../middleware/auth");
const { getConversationSummaries } = require("../services/conversations");
const { getRoomKey } = require("../lib/room");

function createChatRouter(models) {
  const router = express.Router();
  const { User, Message } = models;

  router.get("/chat", isAuthenticated, async (req, res) => {
    try {
      const conversations = await getConversationSummaries(models);
      res.render("chat", {
        title: "Chat",
        active: "chat",
        conversations,
        selected: null,
        messages: [],
        usersById: {},
      });
    } catch (err) {
      console.error("Chat load error:", err);
      res.send("Error loading chat.");
    }
  });

  router.get("/chat/:userA/:userB", isAuthenticated, async (req, res) => {
    const userA = parseInt(req.params.userA, 10);
    const userB = parseInt(req.params.userB, 10);
    if (!Number.isFinite(userA) || !Number.isFinite(userB)) {
      return res.redirect("/chat");
    }

    const a = Math.min(userA, userB);
    const b = Math.max(userA, userB);
    if (a !== userA || b !== userB) {
      return res.redirect(`/chat/${a}/${b}`);
    }

    try {
      const roomKey = getRoomKey(a, b);
      const [conversations, users] = await Promise.all([
        getConversationSummaries(models),
        User.find({ userId: { $in: [a, b] } })
          .lean()
          .exec(),
      ]);

      const messages = await Message.find({
        $or: [
          { roomKey },
          {
            roomKey: { $exists: false },
            $or: [
              { sender: a, recipient: b },
              { sender: b, recipient: a },
            ],
          },
        ],
      })
        .sort({ timestamp: 1, _id: 1 })
        .lean()
        .exec();
      const usersById = Object.fromEntries(users.map((u) => [u.userId, u]));
      res.render("chat", {
        title: "Chat",
        active: "chat",
        conversations,
        selected: { userA: a, userB: b },
        messages,
        usersById,
      });
    } catch (err) {
      console.error("Chat conversation error:", err);
      res.send("Error retrieving conversation messages.");
    }
  });

  return router;
}

module.exports = { createChatRouter };

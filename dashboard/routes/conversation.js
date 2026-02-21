const express = require("express");
const { isAuthenticated } = require("../middleware/auth");

function createConversationRouter(models) {
  const router = express.Router();
  const { User } = models;

  router.get("/conversation", isAuthenticated, async (req, res) => {
    try {
      const users = await User.find({}).sort({ userId: 1 });
      res.render("selectConversation", {
        title: "Conversation",
        active: "conversation",
        users,
        error: null,
      });
    } catch (err) {
      console.error("Conversation selection error:", err);
      res.send("Error retrieving users for conversation.");
    }
  });

  router.post("/conversation", isAuthenticated, async (req, res) => {
    const { sender, receiver } = req.body;
    if (!sender || !receiver) {
      const users = await User.find({}).sort({ userId: 1 });
      return res.render("selectConversation", {
        title: "Conversation",
        active: "conversation",
        users,
        error: "Please select both users.",
      });
    }
    const a = Math.min(parseInt(sender, 10), parseInt(receiver, 10));
    const b = Math.max(parseInt(sender, 10), parseInt(receiver, 10));
    return res.redirect(`/chat/${a}/${b}`);
  });

  router.get(
    "/conversation/:senderId/:receiverId",
    isAuthenticated,
    async (req, res) => {
      const senderId = parseInt(req.params.senderId, 10);
      const receiverId = parseInt(req.params.receiverId, 10);
      res.redirect(`/chat/${senderId}/${receiverId}`);
    },
  );

  return router;
}

module.exports = { createConversationRouter };

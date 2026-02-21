const express = require("express");
const { isAuthenticated } = require("../middleware/auth");

function createMessagesRouter(models) {
  const router = express.Router();
  const { Message } = models;

  router.get("/messages", isAuthenticated, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = 50;
      const skip = (page - 1) * limit;
      const { from, to } = req.query;
      let filter = {};
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) {
          const toDate = new Date(to);
          toDate.setDate(toDate.getDate() + 1);
          filter.timestamp.$lte = toDate;
        }
      }
      const [messages, totalCount] = await Promise.all([
        Message.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments(filter),
      ]);
      const totalPages = Math.ceil(totalCount / limit) || 1;
      res.render("messages", {
        title: "Messages",
        active: "messages",
        messages,
        from: from || "",
        to: to || "",
        page,
        totalPages,
        totalCount,
      });
    } catch (err) {
      console.error("Messages fetch error:", err);
      res.status(500).render("error", {
        title: "Error",
        active: "messages",
        message: "Error retrieving messages.",
      });
    }
  });

  router.post("/message/:id/delete", isAuthenticated, async (req, res) => {
    try {
      await Message.findByIdAndDelete(req.params.id);
      res.redirect("/messages?flash=message_deleted");
    } catch (err) {
      console.error("Message delete error:", err);
      res.redirect("/messages?flash=error");
    }
  });

  return router;
}

module.exports = { createMessagesRouter };

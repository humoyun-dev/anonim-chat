const express = require("express");
const { Parser } = require("json2csv");
const { isAuthenticated } = require("../middleware/auth");

function createExportRouter(models) {
  const router = express.Router();
  const { Message } = models;

  router.get("/export/messages", isAuthenticated, async (req, res) => {
    try {
      const messages = await Message.find({}).sort({ timestamp: -1 });
      const parser = new Parser({
        fields: ["sender", "recipient", "text", "timestamp"],
      });
      const csv = parser.parse(messages);
      res.header("Content-Type", "text/csv");
      res.attachment("messages.csv");
      return res.send(csv);
    } catch (err) {
      console.error("CSV export error:", err);
      res.send("Error exporting messages.");
    }
  });

  return router;
}

module.exports = { createExportRouter };

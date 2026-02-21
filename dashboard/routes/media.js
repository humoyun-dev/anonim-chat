const express = require("express");
const { pipeline } = require("stream");
const { Readable } = require("stream");
const { isAuthenticated } = require("../middleware/auth");

/**
 * Proxy route: GET /tg-media/:fileId
 *
 * Resolves a Telegram file_id → actual file bytes, then pipes them through
 * to the browser with the correct Content-Type.
 * Piping (instead of 302) avoids mixed-content, CORS, and content-type
 * issues — the browser always sees the file as coming from this server.
 */
function createMediaRouter(config) {
  const router = express.Router();
  const botToken = config.botToken;

  // Extension → Content-Type map
  const EXT_CT = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    webm: "video/webm",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/opus",
    mp3: "audio/mpeg",
    tgs: "application/x-tgsticker",
  };

  router.get("/tg-media/:fileId", isAuthenticated, async (req, res) => {
    if (!botToken) {
      return res
        .status(503)
        .send("TELEGRAM_BOT_TOKEN not configured in this environment.");
    }

    const fileId = req.params.fileId;
    // Telegram file_ids: base64url chars, ~40-100 chars typically
    if (!fileId || fileId.length < 10 || fileId.length > 300) {
      return res.status(400).send("Invalid file ID.");
    }

    try {
      // Step 1: resolve file_id → file_path
      const metaResp = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      const meta = await metaResp.json();

      if (!meta.ok || !meta.result?.file_path) {
        console.warn("tg-media: getFile failed", meta.description || meta);
        return res.status(404).send("Media not found.");
      }

      const filePath = meta.result.file_path;
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      const contentType = EXT_CT[ext] || "application/octet-stream";

      // Step 2: stream file bytes to browser
      const fileResp = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${filePath}`,
        { signal: AbortSignal.timeout(30000) },
      );

      if (!fileResp.ok) {
        return res.status(502).send("Failed to fetch file from Telegram.");
      }

      // Cache for 1 hour — Telegram file URLs are stable for 1 hour
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (meta.result.file_size) {
        res.setHeader("Content-Length", meta.result.file_size);
      }

      // Pipe Web ReadableStream → Node.js response
      const nodeStream = Readable.fromWeb(fileResp.body);
      pipeline(nodeStream, res, (err) => {
        if (err && !res.headersSent) {
          console.error("tg-media pipeline error:", err);
        }
      });
    } catch (err) {
      if (!res.headersSent) {
        console.error("tg-media proxy error:", err);
        res.status(500).send("Error fetching media.");
      }
    }
  });

  return router;
}

module.exports = { createMediaRouter };

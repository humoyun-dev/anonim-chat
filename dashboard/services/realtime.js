const { getRoomKey } = require("../lib/room");

function setupSocketAuth(io, sessionMiddleware) {
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });
  io.use((socket, next) => {
    if (socket.request.session && socket.request.session.loggedIn)
      return next();
    return next(new Error("Unauthorized"));
  });
  io.on("connection", (socket) => {
    console.log("New socket connected:", socket.id);
    socket.on("joinConversation", ({ senderId, receiverId }) => {
      const a = Number.parseInt(senderId, 10);
      const b = Number.parseInt(receiverId, 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      const room = getRoomKey(a, b);
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });
  });
}

function createBroadcastReactionUpdate(io) {
  return function broadcastReactionUpdate(messageData) {
    const room = getRoomKey(messageData.sender, messageData.recipient);
    io.to(room).emit("reactionUpdate", {
      messageId: String(messageData._id),
      senderReaction: messageData.senderReaction || null,
      recipientReaction: messageData.recipientReaction || null,
    });
  };
}

function createBroadcastNewMessage(io, { ConversationSummary }) {
  return async function broadcastNewMessage(messageData) {
    const room = getRoomKey(messageData.sender, messageData.recipient);
    io.to(room).emit("newMessage", messageData);
    io.emit("conversationUpdated", messageData);

    const sender = Number.parseInt(messageData.sender, 10);
    const recipient = Number.parseInt(messageData.recipient, 10);
    if (!Number.isFinite(sender) || !Number.isFinite(recipient)) return;

    const roomKey = getRoomKey(sender, recipient);
    const userA = Math.min(sender, recipient);
    const userB = Math.max(sender, recipient);
    const lastMessageAt = messageData.timestamp
      ? new Date(messageData.timestamp)
      : new Date();
    const kind = messageData.kind || "text";
    const preview = String(messageData.text || "")
      .trim()
      .slice(0, 180);
    const lastMessageText = preview || `[${kind}]`;

    ConversationSummary.findOneAndUpdate(
      { roomKey },
      {
        $set: {
          roomKey,
          userA,
          userB,
          lastMessageId: messageData._id,
          lastMessageAt,
          lastMessageText,
          lastKind: kind,
          lastSender: sender,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    ).catch((err) => console.error("ConversationSummary update error:", err));
  };
}

function startRealtimeMessageFeed(
  Message,
  broadcastNewMessage,
  broadcastReactionUpdate,
) {
  let pollingStarted = false;
  let pollingStop = false;
  let changeStream = null;
  let retryTimer = null;
  const CHANGE_STREAM_RETRY_MS = 30_000;

  function stopPolling() {
    pollingStop = true;
    pollingStarted = false;
  }

  function scheduleChangeStreamRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      tryStartChangeStream().catch((err) =>
        console.warn("Change stream retry failed:", err?.message || err),
      );
    }, CHANGE_STREAM_RETRY_MS);
  }

  function startPollingFallback(initialLastSeenId = null) {
    if (pollingStarted) return;
    pollingStarted = true;
    pollingStop = false;

    let lastSeenId = initialLastSeenId;
    let delayMs = 1200;

    const tick = async () => {
      if (pollingStop) return;
      try {
        if (!lastSeenId) {
          const latest = await Message.findOne({})
            .sort({ _id: -1 })
            .select({ _id: 1 })
            .lean()
            .exec();
          lastSeenId = latest?._id || null;
          delayMs = 1200;
          setTimeout(tick, delayMs);
          return;
        }

        let loops = 0;
        let batch = [];
        do {
          batch = await Message.find({ _id: { $gt: lastSeenId } })
            .sort({ _id: 1 })
            .limit(200)
            .lean()
            .exec();
          for (const m of batch) {
            lastSeenId = m._id;
            await broadcastNewMessage(m);
          }
          loops += 1;
        } while (batch.length === 200 && loops < 8);

        delayMs = batch.length === 200 ? 200 : 1200;
      } catch (err) {
        console.error("Polling realtime error:", err);
        delayMs = Math.min(delayMs * 2, 30_000);
      }

      setTimeout(tick, delayMs);
    };

    setTimeout(tick, delayMs);
  }

  async function tryStartChangeStream() {
    if (changeStream) return true;
    try {
      const cs = Message.watch([], { fullDocument: "updateLookup" });
      cs.on("change", async (change) => {
        if (change.operationType === "insert" && change.fullDocument) {
          await broadcastNewMessage(change.fullDocument);
        } else if (
          change.operationType === "update" &&
          change.fullDocument &&
          broadcastReactionUpdate
        ) {
          const updatedFields = change.updateDescription?.updatedFields || {};
          const hasReactionChange = Object.keys(updatedFields).some(
            (k) =>
              k.startsWith("reactions") ||
              k === "senderReaction" ||
              k === "recipientReaction",
          );
          if (hasReactionChange) {
            broadcastReactionUpdate(change.fullDocument);
          }
        }
      });
      cs.on("error", (err) => {
        console.error("Message change stream error:", err);
        try {
          cs.close();
        } catch {
          // ignore
        }
        changeStream = null;
        startPollingFallback();
        scheduleChangeStreamRetry();
      });

      changeStream = cs;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      stopPolling();
      console.log("Message change stream started (realtime).");
      return true;
    } catch (err) {
      console.warn(
        "Change Streams unavailable. Using polling fallback.",
        err?.message || err,
      );
      scheduleChangeStreamRetry();
      return false;
    }
  }

  return (async () => {
    const started = await tryStartChangeStream();
    if (started) return;

    try {
      const latest = await Message.findOne({})
        .sort({ _id: -1 })
        .select({ _id: 1 })
        .lean()
        .exec();
      startPollingFallback(latest?._id || null);
    } catch (err) {
      console.error("Polling init error:", err);
      startPollingFallback();
    }
  })();
}

module.exports = {
  setupSocketAuth,
  createBroadcastNewMessage,
  createBroadcastReactionUpdate,
  startRealtimeMessageFeed,
};

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const http = require("http");
const nodeCrypto = require("node:crypto");
const helmet = require("helmet");
const { Parser } = require("json2csv");
const socketio = require("socket.io");
const rateLimit = require("express-rate-limit");
const { getRoomKey } = require("./lib/room");
const { loadDashboardConfig } = require("./lib/env");

// Import models
const User = require("./models/user");
const Message = require("./models/message");
const SessionModel = require("./models/session");
const ConversationSummary = require("./models/conversationSummary");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const config = loadDashboardConfig(process.env);
const isTest = config.nodeEnv === "test";
const isProduction = config.isProduction;

const mongoUri = config.mongoUri;
if (!mongoUri) throw new Error("MONGODB_URI not found in environment (.env)");

// Middleware
app.disable("x-powered-by");
if (config.trustProxy || isProduction) app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const resolvedSessionSecret = config.sessionSecret || "dev-session-secret";
if (!config.sessionSecret) {
  console.warn("SESSION_SECRET is not set. Using an insecure dev default.");
}

const sessionStore = isTest
  ? undefined
  : MongoStore.create({
      mongoUrl: mongoUri,
      ttl: 7 * 24 * 60 * 60,
      autoRemove: "native",
    });

const sessionMiddleware = session({
  name: "anonim.sid",
  secret: resolvedSessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});
app.use(sessionMiddleware);

// CSRF protection (synchronizer token pattern; stored in session).
app.use((req, res, next) => {
  if (req.path.startsWith("/socket.io")) return next();
  if (!req.session) return res.status(500).send("Session not initialized.");

  if (!req.session.csrfToken) {
    req.session.csrfToken = nodeCrypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;

  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const token =
    (req.body && req.body._csrf) ||
    req.headers["x-csrf-token"] ||
    req.headers["x-xsrf-token"];
  if (!token || !safeEqual(token, req.session.csrfToken)) {
    return res.status(403).send("Invalid CSRF token.");
  }
  return next();
});
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Simple admin credentials
const ADMIN_USER = config.adminUser || "admin";
const ADMIN_PASS = config.adminPass || "password";
if (!config.adminUser || !config.adminPass) {
  console.warn("ADMIN_USER/ADMIN_PASS is not set. Using insecure dev defaults.");
}

function safeEqual(a, b) {
  const strA = String(a || "");
  const strB = String(b || "");
  const len = Math.max(strA.length, strB.length, 1);
  const bufA = Buffer.from(strA.padEnd(len));
  const bufB = Buffer.from(strB.padEnd(len));
  const equal = nodeCrypto.timingSafeEqual(bufA, bufB);
  return equal && strA.length === strB.length;
}

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.redirect("/login");
}

// ------------------- SOCKET.IO SETUP ------------------- //
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});
io.use((socket, next) => {
  if (socket.request.session && socket.request.session.loggedIn) return next();
  return next(new Error("Unauthorized"));
});
io.on("connection", (socket) => {
  console.log("New socket connected:", socket.id);

  // Allow admin clients to join a conversation room.
  socket.on("joinConversation", ({ senderId, receiverId }) => {
    const a = Number.parseInt(senderId, 10);
    const b = Number.parseInt(receiverId, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    const room = getRoomKey(a, b);
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });
});

// Broadcast new messages to connected clients.
async function broadcastNewMessage(messageData) {
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
  const preview = String(messageData.text || "").trim().slice(0, 180);
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
    { upsert: true }
  ).catch((err) => console.error("ConversationSummary update error:", err));
}

// Watch MongoDB for new messages and push via Socket.io.
async function startRealtimeMessageFeed() {
  let pollingStarted = false;

  function startPollingFallback(initialLastSeenId = null) {
    if (pollingStarted) return;
    pollingStarted = true;

    let lastSeenId = initialLastSeenId;
    let delayMs = 1200;

    const tick = async () => {
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

        // If we drained a backlog, poll a bit faster for a short time.
        delayMs = batch.length === 200 ? 200 : 1200;
      } catch (err) {
        console.error("Polling realtime error:", err);
        delayMs = Math.min(delayMs * 2, 30_000);
      }

      setTimeout(tick, delayMs);
    };

    setTimeout(tick, delayMs);
  }

  // 1) Change Streams (Replica Set/Atlas) — true realtime.
  try {
    const changeStream = Message.watch([], { fullDocument: "updateLookup" });
    changeStream.on("change", async (change) => {
      if (change.operationType === "insert" && change.fullDocument) {
        await broadcastNewMessage(change.fullDocument);
      }
    });
    changeStream.on("error", (err) => {
      console.error("Message change stream error:", err);
      startPollingFallback();
    });
    console.log("Message change stream started (realtime).");
    return;
  } catch (err) {
    console.warn(
      "Change Streams unavailable. Using polling fallback.",
      err?.message || err
    );
  }

  // 2) Fallback: polling (works on standalone MongoDB too).
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
}

mongoose.connection.once("open", () => {
  startRealtimeMessageFeed().catch((err) =>
    console.error("Realtime feed start error:", err)
  );
});

// ------------------- ROUTES ------------------- //

app.get("/", (req, res) => res.redirect("/chat"));

// Login routes
app.get("/login", (req, res) => res.render("login", { error: null }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const ok = safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS);
  if (ok) {
    return req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate error:", err);
        return res.status(500).render("login", { error: "Login failed" });
      }
      req.session.loggedIn = true;
      return res.redirect("/chat");
    });
  }
  console.warn("Admin login failed", {
    ip: req.ip,
    username: String(username || ""),
  });
  return res.render("login", { error: "Invalid credentials" });
});
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

function getUserDisplayName(user) {
  if (!user) return "Unknown user";
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  if (user.username) return `@${user.username}`;
  return String(user.userId);
}

async function getConversationSummaries(limit = 100) {
  let summaries = await ConversationSummary.find({})
    .sort({ lastMessageAt: -1, lastMessageId: -1 })
    .limit(limit)
    .lean()
    .exec();

  if (!summaries || summaries.length === 0) {
    const pipeline = [
      {
        $addFields: {
          userA: {
            $cond: [{ $lt: ["$sender", "$recipient"] }, "$sender", "$recipient"],
          },
          userB: {
            $cond: [{ $lt: ["$sender", "$recipient"] }, "$recipient", "$sender"],
          },
        },
      },
      { $sort: { timestamp: -1, _id: -1 } },
      {
        $group: {
          _id: { userA: "$userA", userB: "$userB" },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $sort: { "lastMessage.timestamp": -1, "lastMessage._id": -1 } },
      { $limit: limit },
    ];

    const conversations = await Message.aggregate(pipeline);
    summaries = conversations
      .map((c) => {
        const lastMessage = c.lastMessage || {};
        const userA = c._id.userA;
        const userB = c._id.userB;
        const preview = String(lastMessage.text || "").trim().slice(0, 180);
        const lastKind = lastMessage.kind || "text";
        const lastMessageText = preview || `[${lastKind}]`;
        return {
          roomKey: getRoomKey(userA, userB),
          userA,
          userB,
          lastMessageId: lastMessage._id,
          lastMessageAt: lastMessage.timestamp,
          lastMessageText,
          lastKind,
          lastSender: lastMessage.sender,
          updatedAt: new Date(),
        };
      })
      .filter((s) => s.lastMessageId && s.lastMessageAt);

    if (summaries.length) {
      const ops = summaries.map((s) => ({
        updateOne: {
          filter: { roomKey: s.roomKey },
          update: { $set: s },
          upsert: true,
        },
      }));
      ConversationSummary.bulkWrite(ops, { ordered: false }).catch((err) =>
        console.error("ConversationSummary seed error:", err)
      );
    }
  }

  const allUserIds = new Set();
  for (const c of summaries) {
    allUserIds.add(c.userA);
    allUserIds.add(c.userB);
  }

  const users = await User.find({ userId: { $in: Array.from(allUserIds) } })
    .lean()
    .exec();
  const usersById = Object.fromEntries(users.map((u) => [u.userId, u]));

  return summaries.map((c) => {
    const userA = usersById[c.userA];
    const userB = usersById[c.userB];
    return {
      userAId: c.userA,
      userBId: c.userB,
      userAName: getUserDisplayName(userA),
      userBName: getUserDisplayName(userB),
      lastTimestamp: c.lastMessageAt,
      lastPreview: c.lastMessageText || `[${c.lastKind || "media"}]`,
    };
  });
}

// Chat-style dashboard (real-time via Socket.io)
app.get("/chat", isAuthenticated, async (req, res) => {
  try {
    const conversations = await getConversationSummaries();
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
app.get("/chat/:userA/:userB", isAuthenticated, async (req, res) => {
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
      getConversationSummaries(),
      User.find({ userId: { $in: [a, b] } }).lean().exec(),
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

// Dashboard Analytics
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const [userCount, messageCount, sessionCount] = await Promise.all([
      User.countDocuments({}),
      Message.countDocuments({}),
      SessionModel.countDocuments({}),
    ]);
    res.render("dashboard", {
      title: "Dashboard",
      active: "dashboard",
      userCount,
      messageCount,
      sessionCount,
    });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.send("Error retrieving dashboard data.");
  }
});

// Users list with search and delete option
app.get("/users", isAuthenticated, async (req, res) => {
  try {
    let query = {};
    if (req.query.search) {
      const regex = new RegExp(req.query.search, "i");
      query = {
        $or: [{ username: regex }, { firstName: regex }, { lastName: regex }],
      };
    }
    const users = await User.find(query).sort({ userId: 1 });
    res.render("users", {
      title: "Users",
      active: "users",
      users,
      search: req.query.search || "",
    });
  } catch (err) {
    console.error("Users fetch error:", err);
    res.send("Error retrieving users.");
  }
});
app.post("/user/:userId/delete", isAuthenticated, async (req, res) => {
  try {
    await User.deleteOne({ userId: parseInt(req.params.userId, 10) });
    res.redirect("/users");
  } catch (err) {
    console.error("User delete error:", err);
    res.send("Error deleting user.");
  }
});

// Global messages list with date filtering and delete option
app.get("/messages", isAuthenticated, async (req, res) => {
  try {
    const { from, to } = req.query;
    let filter = {};
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }
    const messages = await Message.find(filter).sort({ timestamp: -1 });
    res.render("messages", {
      title: "Messages",
      active: "messages",
      messages,
      from: from || "",
      to: to || "",
    });
  } catch (err) {
    console.error("Messages fetch error:", err);
    res.send("Error retrieving messages.");
  }
});
app.post("/message/:id/delete", isAuthenticated, async (req, res) => {
  try {
    await Message.findByIdAndDelete(req.params.id);
    res.redirect("/messages");
  } catch (err) {
    console.error("Message delete error:", err);
    res.send("Error deleting message.");
  }
});

// Sessions List
app.get("/sessions", isAuthenticated, async (req, res) => {
  try {
    const sessions = await SessionModel.find({});
    res.render("sessions", { title: "Sessions", active: "sessions", sessions });
  } catch (err) {
    console.error("Sessions fetch error:", err);
    res.send("Error retrieving sessions.");
  }
});

// CSV Export of messages
app.get("/export/messages", isAuthenticated, async (req, res) => {
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

// ------------------- CONVERSATION ------------------- //

// Conversation partner selection form
app.get("/conversation", isAuthenticated, async (req, res) => {
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
app.post("/conversation", isAuthenticated, async (req, res) => {
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

// Conversation view with real-time updates
app.get(
  "/conversation/:senderId/:receiverId",
  isAuthenticated,
  async (req, res) => {
    const senderId = parseInt(req.params.senderId, 10);
    const receiverId = parseInt(req.params.receiverId, 10);
    res.redirect(`/chat/${senderId}/${receiverId}`);
  }
);

// User Detail: List conversation partners for the user
app.get("/user/:userId/detail", isAuthenticated, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    // Find conversation partners (sent + received).
    const sentPartners = await Message.distinct("recipient", {
      sender: userId,
    });
    const receivedPartners = await Message.distinct("sender", {
      recipient: userId,
    });
    const partnerIds = [...new Set([...sentPartners, ...receivedPartners])];
    const partners = await User.find({ userId: { $in: partnerIds } });
    res.render("userDetail", {
      title: "User Detail",
      active: "users",
      userId,
      partners,
    });
  } catch (err) {
    console.error("Error fetching user detail:", err);
    res.send("Failed to load user details.");
  }
});

// ------------------- SERVER START ------------------- //
const PORT = process.env.PORT || 3000;
async function start() {
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected for dashboard");

  await ConversationSummary.createIndexes().catch((err) =>
    console.error("ConversationSummary index creation error:", err)
  );

  server.listen(PORT, () =>
    console.log(`Admin dashboard running on http://localhost:${PORT}`)
  );
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Dashboard startup error:", err);
    process.exit(1);
  });
}

module.exports = { app };

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const http = require("http");
const { Parser } = require("json2csv");
const socketio = require("socket.io");
const { getRoomKey } = require("./lib/room");

// Import models
const User = require("./models/user");
const Message = require("./models/message");
const SessionModel = require("./models/session");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI env topilmadi (dashboard)");
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "yourSecretKey",
  resave: false,
  saveUninitialized: false,
});
app.use(sessionMiddleware);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Simple admin credentials
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password";

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

  // Foydalanuvchilar o'z konversatsiya xonasiga qo'shilsin.
  socket.on("joinConversation", ({ senderId, receiverId }) => {
    const room = getRoomKey(senderId, receiverId);
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });
});

// Yangi xabarni barcha ulanishga yuborish uchun funksiyani aniqlaymiz.
async function broadcastNewMessage(messageData) {
  const room = getRoomKey(messageData.sender, messageData.recipient);
  io.to(room).emit("newMessage", messageData);
  io.emit("conversationUpdated", messageData);
}

// MongoDB-dagi yangi xabarlarni kuzatib Socket.io orqali push qilish.
async function startRealtimeMessageFeed() {
  let pollingStarted = false;

  function startPollingFallback(initialLastSeenId = null) {
    if (pollingStarted) return;
    pollingStarted = true;

    let lastSeenId = initialLastSeenId;
    setInterval(async () => {
      try {
        if (!lastSeenId) {
          const latest = await Message.findOne({})
            .sort({ _id: -1 })
            .select({ _id: 1 })
            .lean()
            .exec();
          lastSeenId = latest?._id || null;
          return;
        }
        const newMessages = await Message.find({ _id: { $gt: lastSeenId } })
          .sort({ _id: 1 })
          .limit(200)
          .lean()
          .exec();
        for (const m of newMessages) {
          lastSeenId = m._id;
          await broadcastNewMessage(m);
        }
      } catch (err) {
        console.error("Polling realtime error:", err);
      }
    }, 1200);
  }

  // 1) Change Streams (Replica Set/Atlas) bo'lsa — true realtime.
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
      "Change Streams mavjud emas. Polling fallback yoqildi.",
      err?.message || err
    );
  }

  // 2) Fallback: polling (standalone MongoDB uchun ham ishlaydi).
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
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect("/chat");
  }
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
  const allUserIds = new Set();
  for (const c of conversations) {
    allUserIds.add(c._id.userA);
    allUserIds.add(c._id.userB);
  }
  const users = await User.find({ userId: { $in: Array.from(allUserIds) } })
    .lean()
    .exec();
  const usersById = Object.fromEntries(users.map((u) => [u.userId, u]));

  return conversations.map((c) => {
    const userA = usersById[c._id.userA];
    const userB = usersById[c._id.userB];
    const lastMessage = c.lastMessage || {};
    const lastPreview =
      (lastMessage.text || "").trim() || `[${lastMessage.kind || "media"}]`;
    return {
      userAId: c._id.userA,
      userBId: c._id.userB,
      userAName: getUserDisplayName(userA),
      userBName: getUserDisplayName(userB),
      lastTimestamp: lastMessage.timestamp,
      lastPreview,
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
    const [conversations, users, messages] = await Promise.all([
      getConversationSummaries(),
      User.find({ userId: { $in: [a, b] } }).lean().exec(),
      Message.find({
        $or: [
          { sender: a, recipient: b },
          { sender: b, recipient: a },
        ],
      })
        .sort({ timestamp: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
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
  res.redirect(`/chat/${a}/${b}`);
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
    // Foydalanuvchi tomonidan yuborilgan xabarlardan va qabul qilingan xabarlardan hamkorlar
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

  server.listen(PORT, () =>
    console.log(`Admin dashboard running on http://localhost:${PORT}`)
  );
}

start().catch((err) => {
  console.error("Dashboard startup error:", err);
  process.exit(1);
});

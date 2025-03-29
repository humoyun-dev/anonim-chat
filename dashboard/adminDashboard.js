require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const http = require("http");
const { Parser } = require("json2csv");
const socketio = require("socket.io");

// Import models
const User = require("./models/user");
const Message = require("./models/message");
const SessionModel = require("./models/session");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected for dashboard"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "yourSecretKey",
    resave: false,
    saveUninitialized: false,
  })
);
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
io.on("connection", (socket) => {
  console.log("New socket connected:", socket.id);

  // Foydalanuvchilar o'z konversatsiya xonasiga qo'shilsin.
  socket.on("joinConversation", ({ senderId, receiverId }) => {
    const room = [senderId, receiverId].sort().join("_");
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });
});

// Yangi xabarni barcha ulanishga yuborish uchun funksiyani aniqlaymiz.
async function broadcastNewMessage(messageData) {
  const room = [messageData.sender, messageData.recipient].sort().join("_");
  io.to(room).emit("newMessage", messageData);
}

// ------------------- ROUTES ------------------- //

// Login routes
app.get("/login", (req, res) => res.render("login", { error: null }));
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect("/dashboard");
  }
  return res.render("login", { error: "Invalid credentials" });
});
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Dashboard Analytics
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const [userCount, messageCount, sessionCount] = await Promise.all([
      User.countDocuments({}),
      Message.countDocuments({}),
      SessionModel.countDocuments({}),
    ]);
    res.render("dashboard", { userCount, messageCount, sessionCount });
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
    res.render("users", { users, search: req.query.search || "" });
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
    res.render("messages", { messages, from: from || "", to: to || "" });
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
    res.render("sessions", { sessions });
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
    res.render("selectConversation", { users, error: null });
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
      users,
      error: "Iltimos, ikkala foydalanuvchini ham tanlang!",
    });
  }
  res.redirect(
    `/conversation/${parseInt(sender, 10)}/${parseInt(receiver, 10)}`
  );
});

// Conversation view with real-time updates
app.get(
  "/conversation/:senderId/:receiverId",
  isAuthenticated,
  async (req, res) => {
    const senderId = parseInt(req.params.senderId, 10);
    const receiverId = parseInt(req.params.receiverId, 10);
    try {
      const messages = await Message.find({
        $or: [
          { sender: senderId, recipient: receiverId },
          { sender: receiverId, recipient: senderId },
        ],
      }).sort({ timestamp: 1 });
      res.render("conversation", { senderId, receiverId, messages });
    } catch (err) {
      console.error("Conversation fetch error:", err);
      res.send("Error retrieving conversation messages.");
    }
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
    res.render("userDetail", { userId, partners });
  } catch (err) {
    console.error("Error fetching user detail:", err);
    res.send("Foydalanuvchi detailini olishda xatolik yuz berdi.");
  }
});

// ------------------- SERVER START ------------------- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Admin dashboard running on http://localhost:${PORT}`)
);

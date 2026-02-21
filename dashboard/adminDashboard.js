require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const helmet = require("helmet");
const socketio = require("socket.io");
const { loadDashboardConfig } = require("./lib/env");

// Models
const User = require("./models/user");
const Message = require("./models/message");
const SessionModel = require("./models/session");
const ConversationSummary = require("./models/conversationSummary");

// Middleware
const {
  createSessionMiddleware,
  csrfMiddleware,
} = require("./middleware/auth");

// Routes
const { createAuthRouter } = require("./routes/auth");
const { createChatRouter } = require("./routes/chat");
const { createDashboardRouter } = require("./routes/dashboard");
const { createUsersRouter } = require("./routes/users");
const { createMessagesRouter } = require("./routes/messages");
const { createSessionsRouter } = require("./routes/sessions");
const { createConversationRouter } = require("./routes/conversation");
const { createExportRouter } = require("./routes/export");
const { createMediaRouter } = require("./routes/media");

// Services
const {
  setupSocketAuth,
  createBroadcastNewMessage,
  createBroadcastReactionUpdate,
  startRealtimeMessageFeed,
} = require("./services/realtime");

/* -------------------- CONFIG -------------------- */
const config = loadDashboardConfig(process.env);
const isProduction = config.isProduction;
const mongoUri = config.mongoUri;
if (!mongoUri) throw new Error("MONGODB_URI not found in environment (.env)");

/* -------------------- EXPRESS APP -------------------- */
const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.disable("x-powered-by");
if (config.trustProxy || isProduction) app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = createSessionMiddleware(config);
app.use(sessionMiddleware);
app.use(csrfMiddleware);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

/* -------------------- MODELS OBJECT -------------------- */
const models = { User, Message, SessionModel, ConversationSummary };

/* -------------------- ROUTES -------------------- */
app.get("/", (req, res) => res.redirect("/chat"));
app.use(createAuthRouter(config));
app.use(createChatRouter(models));
app.use(createDashboardRouter(models));
app.use(createUsersRouter(models));
app.use(createMessagesRouter(models));
app.use(createSessionsRouter(models));
app.use(createConversationRouter(models));
app.use(createExportRouter(models));
app.use(createMediaRouter(config));

/* -------------------- SOCKET.IO -------------------- */
setupSocketAuth(io, sessionMiddleware);

const broadcastNewMessage = createBroadcastNewMessage(io, models);
const broadcastReactionUpdate = createBroadcastReactionUpdate(io);

mongoose.connection.once("open", () => {
  startRealtimeMessageFeed(
    Message,
    broadcastNewMessage,
    broadcastReactionUpdate,
  ).catch((err) => console.error("Realtime feed start error:", err));
});

/* -------------------- START -------------------- */
const PORT = process.env.PORT || 3000;

async function start() {
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected for dashboard");

  await ConversationSummary.createIndexes().catch((err) =>
    console.error("ConversationSummary index creation error:", err),
  );

  server.listen(PORT, () =>
    console.log(`Admin dashboard running on http://localhost:${PORT}`),
  );
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Dashboard startup error:", err);
    process.exit(1);
  });
}

module.exports = { app };

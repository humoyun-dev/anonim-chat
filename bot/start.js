require("dotenv").config();
const { Bot } = require("grammy");
const mongoose = require("mongoose");
const { normalizeLang, t } = require("./lib/i18n");
const { createSpamGuard } = require("./lib/spamGuard");
const { createGetUserLang } = require("./lib/userLang");
const { createPaymentService } = require("./lib/payment");
const { createMessageSender } = require("./lib/messageSender");
const { registerCommands } = require("./handlers/commands");
const { registerMessageHandler } = require("./handlers/messages");
const { registerCallbackHandler } = require("./handlers/callbacks");
const { registerReactionHandler } = require("./handlers/reactions");
const {
  createUserModel,
  createMessageModel,
  createSessionModel,
  createReplyStateModel,
  createConversationSummaryModel,
} = require("../shared/models");

/* -------------------- CONFIG -------------------- */
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI not found in environment (.env)");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN not found in environment (.env)");

const botUsername = process.env.BOT_USERNAME;
if (!botUsername) {
  console.warn(
    "BOT_USERNAME is missing. /getlink may generate an invalid URL.",
  );
}

const REVEAL_STARS_COST_RAW = Number.parseInt(
  process.env.REVEAL_STARS_COST || "50",
  10,
);
const REVEAL_STARS_COST = Number.isFinite(REVEAL_STARS_COST_RAW)
  ? REVEAL_STARS_COST_RAW
  : 50;

/* -------------------- MODELS -------------------- */
const User = createUserModel(mongoose);
const Message = createMessageModel(mongoose);
const ConversationSummary = createConversationSummaryModel(mongoose);
const Session = createSessionModel(mongoose);
const ReplyState = createReplyStateModel(mongoose);

/* -------------------- BOT INSTANCE -------------------- */
const bot = new Bot(token);

bot.catch((err) => console.error("Bot error:", err));
process.on("unhandledRejection", (reason) =>
  console.error("Unhandled promise rejection:", reason),
);
process.on("uncaughtException", (err) =>
  console.error("Uncaught exception:", err),
);

/* -------------------- SERVICES -------------------- */
const bannedWords = ["badword1", "badword2", "spamphrase"];
const spamGuard = createSpamGuard({
  bannedWords,
  windowMs: 10_000,
  maxMessages: 5,
  staleMs: 60 * 60 * 1000,
});
setInterval(() => spamGuard.cleanup(), 10 * 60 * 1000);

const getUserLang = createGetUserLang(User);
const paymentService = createPaymentService({ bot, User, REVEAL_STARS_COST });
const messageSender = createMessageSender(bot);

/* -------------------- SHARED DEPS -------------------- */
const deps = {
  User,
  Message,
  Session,
  ReplyState,
  ConversationSummary,
  REVEAL_STARS_COST,
  botUsername,
  getUserLang,
  spamGuard,
  paymentService,
  messageSender,
};

/* -------------------- MIDDLEWARE -------------------- */
bot.use(async (ctx, next) => {
  if (!ctx.state) ctx.state = {};
  if (ctx.from) {
    const telegramLang = normalizeLang(ctx.from.language_code);
    ctx.state.lang = await getUserLang(ctx.from.id, {
      fallback: "en",
      telegramHint: telegramLang,
    });
    User.updateOne(
      { userId: ctx.from.id },
      {
        $set: {
          userId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          telegramLang,
        },
        $setOnInsert: { lang: "en", langSelected: false },
      },
      { upsert: true },
    ).catch((err) => console.error("User upsert error:", err));
  } else {
    ctx.state.lang = "en";
  }
  return next();
});

/* -------------------- HANDLERS -------------------- */
registerCommands(bot, deps);
registerMessageHandler(bot, deps);
registerCallbackHandler(bot, deps);
registerReactionHandler(bot, deps);

/* -------------------- START -------------------- */
async function start() {
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  await Promise.all([
    Message.createIndexes().catch((err) =>
      console.error("Message index creation error:", err),
    ),
    ConversationSummary.createIndexes().catch((err) =>
      console.error("ConversationSummary index creation error:", err),
    ),
    Session.createIndexes().catch((err) =>
      console.error("Session index creation error:", err),
    ),
    ReplyState.createIndexes().catch((err) =>
      console.error("ReplyState index creation error:", err),
    ),
  ]);

  const commandsFor = (lang) => [
    { command: "start", description: t(lang, "cmd_desc_start") },
    { command: "getlink", description: t(lang, "cmd_desc_getlink") },
    { command: "lang", description: t(lang, "cmd_desc_lang") },
    { command: "help", description: t(lang, "cmd_desc_help") },
    { command: "menu", description: t(lang, "cmd_desc_menu") },
    { command: "userstats", description: t(lang, "cmd_desc_userstats") },
    { command: "cancel", description: t(lang, "cmd_desc_cancel") },
    { command: "paysupport", description: t(lang, "cmd_desc_paysupport") },
  ];

  await bot.api.setMyCommands(commandsFor("en"));
  await bot.api.setMyCommands(commandsFor("en"), { language_code: "en" });
  await bot.api.setMyCommands(commandsFor("ru"), { language_code: "ru" });
  await bot.api.setMyCommands(commandsFor("uz"), { language_code: "uz" });

  bot.start({
    allowed_updates: [
      "message",
      "callback_query",
      "message_reaction",
      "message_reaction_count",
    ],
  });
  console.log("Bot started");
}

start().catch((err) => {
  console.error("Bot startup error:", err);
  process.exit(1);
});

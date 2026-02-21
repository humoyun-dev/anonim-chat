const { t, getPaySupportText } = require("../lib/i18n");
const { isValidMongoId } = require("../lib/telegram");
const {
  buildMainMenuKeyboard,
  buildBackMenuKeyboard,
} = require("../lib/keyboards");

function registerCommands(bot, deps) {
  const {
    User,
    Message,
    Session,
    ReplyState,
    botUsername,
    getUserLang,
    paymentService,
  } = deps;

  // /getlink
  async function handleGetLink(ctx) {
    const chatId = ctx.chat?.id;
    const ownerId = ctx.from?.id;
    if (!chatId || !ownerId) return;
    const lang = ctx.state.lang || "en";

    const link = `https://t.me/${botUsername}?start=owner_${ownerId}`;
    await bot.api.sendMessage(chatId, t(lang, "cmd_getlink", { link }));
    console.log(`Owner ${ownerId} uchun havola yaratilgan: ${link}`);
  }

  bot.command("getlink", handleGetLink);
  bot.command("link", handleGetLink);
  bot.command("havola", handleGetLink);
  bot.command("ssylka", handleGetLink);

  // /paysupport
  async function handlePaySupport(ctx) {
    try {
      const lang = ctx.state.lang || "en";
      await bot.api.sendMessage(ctx.chat.id, getPaySupportText(lang));
    } catch (err) {
      console.error("/paysupport error:", err);
    }
  }

  bot.command("paysupport", handlePaySupport);
  bot.command("support", handlePaySupport);
  bot.command("tolov", handlePaySupport);
  bot.command("oplata", handlePaySupport);

  // /lang
  const { buildLangKeyboard } = require("../lib/keyboards");
  bot.command("lang", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.state.lang || "en";
    await bot.api.sendMessage(chatId, t(lang, "lang_choose"), {
      reply_markup: buildLangKeyboard(lang, lang),
    });
  });

  // /cancel
  async function handleCancelReply(ctx) {
    const chatId = ctx.chat?.id;
    const ownerId = ctx.from?.id;
    if (!chatId || !ownerId) return;
    const lang = ctx.state.lang || "en";
    const result = await ReplyState.deleteOne({ ownerId }).catch((err) => {
      console.error("ReplyState cancel error:", err);
      return null;
    });

    const didCancel = Boolean(result && result.deletedCount > 0);
    await bot.api.sendMessage(
      chatId,
      didCancel ? t(lang, "cancel_reply_done") : t(lang, "cancel_reply_none"),
    );
  }

  bot.command("cancel", handleCancelReply);
  bot.command("bekor", handleCancelReply);
  bot.command("otmena", handleCancelReply);

  // pre_checkout_query
  bot.on("pre_checkout_query", async (ctx) => {
    try {
      await bot.api.answerPreCheckoutQuery(
        ctx.update.pre_checkout_query.id,
        true,
      );
    } catch (err) {
      console.error("pre_checkout_query error:", err);
    }
  });

  // /start
  bot.command("start", async (ctx) => {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    const param = (ctx.match || "").trim();
    if (!chatId || !fromId) return;
    const lang = ctx.state.lang || "en";

    if (!param) {
      const activeSession = await Session.findOne({ anonUserId: fromId })
        .lean()
        .exec();
      const welcomeKey = activeSession
        ? "start_active_session"
        : "welcome_main";
      await bot.api.sendMessage(chatId, t(lang, welcomeKey), {
        reply_markup: buildMainMenuKeyboard(lang),
      });
      return;
    }

    if (param.startsWith("reveal_")) {
      const messageId = param.replace("reveal_", "");
      if (!isValidMongoId(messageId)) {
        await bot.api.sendMessage(chatId, t(lang, "reveal_invalid_param"));
        return;
      }

      const messageDoc = await Message.findById(messageId).lean().exec();
      if (!messageDoc) {
        await bot.api.sendMessage(chatId, t(lang, "message_not_found"));
        return;
      }
      if (messageDoc.recipient !== fromId) {
        await bot.api.sendMessage(chatId, t(lang, "payment_not_allowed"));
        return;
      }

      if (messageDoc.reveal?.purchased) {
        await paymentService.revealSenderToOwner(chatId, messageDoc, lang);
        return;
      }

      await paymentService.sendRevealInvoice(chatId, messageId, lang);
      return;
    }

    if (param.startsWith("owner_")) {
      const ownerIdFromParam = parseInt(param.replace("owner_", ""), 10);
      if (fromId === ownerIdFromParam) {
        await bot.api.sendMessage(chatId, t(lang, "start_owner_self"), {
          reply_markup: buildMainMenuKeyboard(lang),
        });
        console.log(`Owner ${fromId} o'z havolasi orqali tizimga kirgan.`);
      } else {
        try {
          await Session.findOneAndUpdate(
            { anonUserId: fromId },
            { ownerId: ownerIdFromParam },
            { upsert: true, new: true },
          );
          await bot.api.sendMessage(chatId, t(lang, "start_joined"));

          const ownerLang = await getUserLang(ownerIdFromParam, {
            fallback: "en",
          });
          await bot.api.sendMessage(
            ownerIdFromParam,
            t(ownerLang, "start_owner_notified"),
          );
          console.log(
            `Sessiya yaratilgan: Anon ${fromId} -> Owner ${ownerIdFromParam}`,
          );
        } catch (err) {
          console.error("Sessiyani saqlashda xatolik:", err);
          await bot.api.sendMessage(
            chatId,
            t(lang, "start_session_save_error"),
          );
        }
      }
    } else {
      await bot.api.sendMessage(chatId, t(lang, "start_wrong_param"));
    }
  });

  // /userstats
  async function handleUserStats(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;
    const lang = ctx.state.lang || "en";
    try {
      const messageCount = await Message.countDocuments({ sender: userId });
      const sessionsAsAnon = await Session.countDocuments({
        anonUserId: userId,
      });
      const sessionsAsOwner = await Session.countDocuments({ ownerId: userId });
      const lastMessage = await Message.findOne({ sender: userId }).sort({
        timestamp: -1,
      });
      const locale =
        lang === "ru" ? "ru-RU" : lang === "uz" ? "uz-UZ" : "en-US";
      const lastActivity = lastMessage
        ? new Date(lastMessage.timestamp).toLocaleString(locale)
        : t(lang, "userstats_no_activity");

      const reportLines = [
        t(lang, "userstats_title"),
        t(lang, "userstats_sent", { count: messageCount }),
        t(lang, "userstats_sessions_anon", { count: sessionsAsAnon }),
        t(lang, "userstats_sessions_owner", { count: sessionsAsOwner }),
        t(lang, "userstats_last_activity", { value: lastActivity }),
      ];

      await bot.api.sendMessage(chatId, reportLines.join("\n"));
    } catch (err) {
      console.error("Foydalanuvchi analitikasi so'rovida xatolik:", err);
      await bot.api.sendMessage(chatId, t(lang, "userstats_error"));
    }
  }

  bot.command("userstats", handleUserStats);
  bot.command("stats", handleUserStats);
  bot.command("stat", handleUserStats);

  // /help
  async function handleHelp(ctx) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.state.lang || "en";
    await bot.api.sendMessage(chatId, t(lang, "help_text"), {
      reply_markup: buildBackMenuKeyboard(lang),
    });
  }

  bot.command("help", handleHelp);
  bot.command("yordam", handleHelp);
  bot.command("pomosh", handleHelp);

  // /menu
  async function handleMenu(ctx) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.state.lang || "en";
    await bot.api.sendMessage(chatId, t(lang, "welcome_main"), {
      reply_markup: buildMainMenuKeyboard(lang),
    });
  }

  bot.command("menu", handleMenu);
  bot.command("menyu", handleMenu);
}

module.exports = { registerCommands };

const { t, getPaySupportText } = require("../lib/i18n");
const { isValidMongoId } = require("../lib/telegram");
const { parseCallbackData } = require("../lib/callbackData");
const {
  buildLangKeyboard,
  buildMainMenuKeyboard,
  buildBackMenuKeyboard,
} = require("../lib/keyboards");
const { cacheSetUserLang } = require("../lib/userLang");

function registerCallbackHandler(bot, deps) {
  const {
    User,
    Message,
    Session,
    ReplyState,
    REVEAL_STARS_COST,
    botUsername,
    getUserLang,
    paymentService,
  } = deps;

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const actorId = ctx.from.id;
    const callbackQueryId = ctx.callbackQuery.id;
    const lang = ctx.state.lang || "en";

    const parsed = parseCallbackData(data);
    if (!parsed) {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_error"),
      });
      return;
    }

    if (parsed.type === "lang") {
      const selected = ["en", "ru", "uz"].includes(parsed.lang)
        ? parsed.lang
        : null;
      if (!selected) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_error"),
        });
        return;
      }

      await User.updateOne(
        { userId: actorId },
        { $set: { lang: selected, langSelected: true } },
        { upsert: true },
      ).catch((err) => console.error("Language update error:", err));
      cacheSetUserLang(actorId, selected);

      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(selected, "lang_updated"),
      });

      const langKb = buildLangKeyboard(selected, selected);
      langKb.inline_keyboard.push([
        { text: t(selected, "btn_back_menu"), callback_data: "menu:main" },
      ]);
      try {
        await ctx.editMessageText(t(selected, "lang_choose"), {
          reply_markup: langKb,
        });
      } catch (err) {
        console.warn("editMessageText (lang) failed:", err?.message || err);
      }
      return;
    }

    if (parsed.type === "cancel_reply") {
      const result = await ReplyState.deleteOne({ ownerId: actorId }).catch(
        (err) => {
          console.error("ReplyState cancel callback error:", err);
          return null;
        },
      );
      const didCancel = Boolean(result && result.deletedCount > 0);
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: didCancel
          ? t(lang, "cancel_reply_done")
          : t(lang, "cancel_reply_none"),
      });
      return;
    }

    if (parsed.type === "menu") {
      const chatId = ctx.callbackQuery.message?.chat?.id;
      if (!chatId) {
        await bot.api.answerCallbackQuery(callbackQueryId);
        return;
      }

      if (parsed.action === "main") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        try {
          await ctx.editMessageText(t(lang, "welcome_main"), {
            reply_markup: buildMainMenuKeyboard(lang),
          });
        } catch (err) {
          console.warn(
            "editMessageText (menu:main) failed:",
            err?.message || err,
          );
          await bot.api.sendMessage(chatId, t(lang, "welcome_main"), {
            reply_markup: buildMainMenuKeyboard(lang),
          });
        }
        return;
      }

      if (parsed.action === "getlink") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        const link = `https://t.me/${botUsername}?start=owner_${actorId}`;
        try {
          await ctx.editMessageText(t(lang, "cmd_getlink", { link }), {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        } catch (err) {
          console.warn(
            "editMessageText (menu:getlink) failed:",
            err?.message || err,
          );
          await bot.api.sendMessage(chatId, t(lang, "cmd_getlink", { link }), {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        }
        return;
      }

      if (parsed.action === "lang") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        const langKeyboard = buildLangKeyboard(lang, lang);
        langKeyboard.inline_keyboard.push([
          { text: t(lang, "btn_back_menu"), callback_data: "menu:main" },
        ]);
        try {
          await ctx.editMessageText(t(lang, "lang_choose"), {
            reply_markup: langKeyboard,
          });
        } catch (err) {
          console.warn(
            "editMessageText (menu:lang) failed:",
            err?.message || err,
          );
          await bot.api.sendMessage(chatId, t(lang, "lang_choose"), {
            reply_markup: langKeyboard,
          });
        }
        return;
      }

      if (parsed.action === "stats") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        try {
          const messageCount = await Message.countDocuments({
            sender: actorId,
          });
          const sessionsAsAnon = await Session.countDocuments({
            anonUserId: actorId,
          });
          const sessionsAsOwner = await Session.countDocuments({
            ownerId: actorId,
          });
          const lastMessage = await Message.findOne({
            sender: actorId,
          }).sort({ timestamp: -1 });
          const locale =
            lang === "ru" ? "ru-RU" : lang === "uz" ? "uz-UZ" : "en-US";
          const lastActivity = lastMessage
            ? new Date(lastMessage.timestamp).toLocaleString(locale)
            : t(lang, "userstats_no_activity");
          const statsText = [
            t(lang, "userstats_title"),
            t(lang, "userstats_sent", { count: messageCount }),
            t(lang, "userstats_sessions_anon", { count: sessionsAsAnon }),
            t(lang, "userstats_sessions_owner", { count: sessionsAsOwner }),
            t(lang, "userstats_last_activity", { value: lastActivity }),
          ].join("\n");

          try {
            await ctx.editMessageText(statsText, {
              reply_markup: buildBackMenuKeyboard(lang),
            });
          } catch (err) {
            await bot.api.sendMessage(chatId, statsText, {
              reply_markup: buildBackMenuKeyboard(lang),
            });
          }
        } catch (err) {
          console.error("Menu stats error:", err);
          await bot.api.sendMessage(chatId, t(lang, "userstats_error"));
        }
        return;
      }

      if (parsed.action === "paysupport") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        const supportText = getPaySupportText(lang);
        try {
          await ctx.editMessageText(supportText, {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        } catch (err) {
          console.warn(
            "editMessageText (menu:paysupport) failed:",
            err?.message || err,
          );
          await bot.api.sendMessage(chatId, supportText, {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        }
        return;
      }

      if (parsed.action === "help") {
        await bot.api.answerCallbackQuery(callbackQueryId);
        try {
          await ctx.editMessageText(t(lang, "help_text"), {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        } catch (err) {
          console.warn(
            "editMessageText (menu:help) failed:",
            err?.message || err,
          );
          await bot.api.sendMessage(chatId, t(lang, "help_text"), {
            reply_markup: buildBackMenuKeyboard(lang),
          });
        }
        return;
      }

      await bot.api.answerCallbackQuery(callbackQueryId);
      return;
    }

    if (parsed.type === "reveal") {
      const messageId = parsed.messageId;
      if (!isValidMongoId(messageId)) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_invalid_id"),
        });
        return;
      }

      const messageDoc = await Message.findById(messageId).lean().exec();
      if (!messageDoc) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "message_not_found"),
        });
        return;
      }

      if (messageDoc.recipient !== actorId) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_no_permission"),
        });
        return;
      }

      if (messageDoc.reveal?.purchased) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_already_revealed"),
        });
        await paymentService.revealSenderToOwner(actorId, messageDoc, lang);
        return;
      }

      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_payment_required", { stars: REVEAL_STARS_COST }),
      });
      try {
        await paymentService.sendRevealInvoice(actorId, messageId, lang);
      } catch (err) {
        console.error("sendInvoice error:", err);
        await bot.api.sendMessage(actorId, t(lang, "invoice_error"));
      }
      return;
    }

    if (parsed.type === "reply") {
      const anonUserId = parsed.anonUserId;

      // Session may already be closed (auto-closed when anon sent the message).
      // Fall back to message-based authorization: verify a message exists from
      // this anon to this owner, so the Reply button remains functional.
      const session = await Session.findOne({ anonUserId }).lean().exec();
      let authorized = session && session.ownerId === actorId;
      if (!authorized) {
        const msgCheck = await Message.findOne({
          sender: anonUserId,
          recipient: actorId,
        })
          .lean()
          .exec();
        authorized = Boolean(msgCheck);
      }
      if (!authorized) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_reply_not_allowed"),
        });
        console.log(
          `Reply denied: user ${actorId} cannot reply to anon ${anonUserId}.`,
        );
        return;
      }

      await ReplyState.findOneAndUpdate(
        { ownerId: actorId },
        { $set: { anonUserId, createdAt: new Date() } },
        { upsert: true, new: true },
      );
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_reply_prompt"),
      });
      await bot.api.sendMessage(actorId, t(lang, "msg_reply_instruction"), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t(lang, "btn_cancel_reply"),
                callback_data: "cancel_reply",
              },
            ],
          ],
        },
      });
      console.log(
        `Reply mode enabled: owner ${actorId} -> anon ${anonUserId}.`,
      );
      return;
    }

    // "Ask again" — anon wants to ask another question to the same owner
    if (parsed.type === "ask") {
      const ownerId = parsed.ownerId;
      if (!ownerId || ownerId === actorId) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_error"),
        });
        return;
      }
      try {
        await Session.findOneAndUpdate(
          { anonUserId: actorId },
          { ownerId },
          { upsert: true, new: true },
        );
        const ownerLang = await getUserLang(ownerId, { fallback: "en" });
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_ask_prompt"),
        });
        await bot.api.sendMessage(actorId, t(lang, "cb_ask_prompt"));
        await bot.api.sendMessage(
          ownerId,
          t(ownerLang, "msg_ask_owner_notify"),
        );
        console.log(`Ask again: anon ${actorId} -> owner ${ownerId}.`);
      } catch (err) {
        console.error("Ask again error:", err);
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_error"),
        });
      }
      return;
    }

    // Legacy close/repeat buttons — sessions auto-close now
    if (parsed.type === "close" || parsed.type === "repeat") {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_session_closed"),
      });
      return;
    }
  });
}

module.exports = { registerCallbackHandler };

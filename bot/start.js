require("dotenv").config();
const { Bot } = require("grammy");
const mongoose = require("mongoose");
const { getMessageKind, getSpamText, isValidMongoId } = require("./lib/telegram");
const { createSpamGuard } = require("./lib/spamGuard");
const { normalizeLang, t, getPaySupportText } = require("./lib/i18n");

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI not found in environment (.env)");
}

/* ------------------ MODELLAR ------------------ */
// Foydalanuvchi ma'lumotlari: Telegram foydalanuvchi ID, ismi, familiyasi va username
const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true },
  firstName: String,
  lastName: String,
  username: String,
  lang: { type: String, enum: ["en", "ru", "uz"], default: "en" },
  langSelected: { type: Boolean, default: false },
  telegramLang: String,
});
const User = mongoose.model("User", userSchema);

// Xabarlar: yuboruvchi, qabul qiluvchi, xabar matni va yuborilgan vaqt
const messageSchema = new mongoose.Schema({
  sender: { type: Number, required: true },
  recipient: { type: Number, required: true },
  kind: { type: String, default: "text" }, // text/photo/video/document/sticker/...
  text: { type: String, default: "" }, // text yoki caption (bo'lmasa bo'sh)
  tgChatId: Number,
  tgMessageId: Number,
  // Reveal feature uchun joy (Stars) — keyin to'ldiramiz
  reveal: {
    purchased: { type: Boolean, default: false },
    purchasedAt: Date,
    stars: Number,
    telegramPaymentChargeId: String,
  },
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", messageSchema);

// Sessiyalar: anonim foydalanuvchi va owner o'rtasidagi bog'lanish
const sessionSchema = new mongoose.Schema({
  anonUserId: { type: Number, required: true, unique: true },
  ownerId: { type: Number, required: true },
});
const Session = mongoose.model("Session", sessionSchema);

// Reply State: owner javob berayotgan anonim foydalanuvchi
const replySchema = new mongoose.Schema({
  ownerId: { type: Number, required: true, unique: true },
  anonUserId: { type: Number, required: true },
});
const ReplyState = mongoose.model("ReplyState", replySchema);

/* ------------------ BOT SOZLAMALARI ------------------ */
const token = process.env.TELEGRAM_BOT_TOKEN;
const botUsername = process.env.BOT_USERNAME;
const bot = new Bot(token);
const REVEAL_STARS_COST_RAW = Number.parseInt(
  process.env.REVEAL_STARS_COST || "50",
  10
);
const REVEAL_STARS_COST = Number.isFinite(REVEAL_STARS_COST_RAW)
  ? REVEAL_STARS_COST_RAW
  : 50;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN not found in environment (.env)");
}
if (!botUsername) {
  console.warn(
    "BOT_USERNAME is missing. /getlink may generate an invalid URL."
  );
}

bot.catch((err) => {
  console.error("Bot error:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// Spam filtrlash uchun kalit so'zlar ro'yxati
const bannedWords = ["badword1", "badword2", "spamphrase"];
const spamGuard = createSpamGuard({
  bannedWords,
  windowMs: 10_000,
  maxMessages: 5,
  staleMs: 60 * 60 * 1000,
});
setInterval(() => spamGuard.cleanup(), 10 * 60 * 1000);

const userLangCache = new Map();
const USER_LANG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheGetUserLang(userId) {
  const entry = userLangCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at > USER_LANG_CACHE_TTL_MS) {
    userLangCache.delete(userId);
    return null;
  }
  return entry.lang;
}

function cacheSetUserLang(userId, lang) {
  if (!userId) return;
  userLangCache.set(userId, { lang: normalizeLang(lang), at: Date.now() });
}

async function getUserLang(userId, { fallback = "en", telegramHint } = {}) {
  if (!userId) return normalizeLang(telegramHint || fallback);
  const cached = cacheGetUserLang(userId);
  if (cached) return cached;
  try {
    const user = await User.findOne({ userId })
      .select({ lang: 1, langSelected: 1, telegramLang: 1 })
      .lean()
      .exec();
    const resolved = normalizeLang(
      user?.langSelected
        ? user?.lang || fallback
        : telegramHint || user?.telegramLang || fallback
    );
    cacheSetUserLang(userId, resolved);
    return resolved;
  } catch (err) {
    console.error("getUserLang error:", err);
    return normalizeLang(telegramHint || fallback);
  }
}

bot.use(async (ctx, next) => {
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
        $setOnInsert: {
          lang: "en",
          langSelected: false,
        },
      },
      { upsert: true }
    ).catch((err) => console.error("User upsert error:", err));
  } else {
    ctx.state.lang = "en";
  }
  return next();
});

function buildLangKeyboard(currentLang, uiLang) {
  const current = normalizeLang(currentLang);
  const lang = normalizeLang(uiLang);
  const label = (code, key) => {
    const base = t(lang, key);
    return current === code ? `${base} ✅` : base;
  };
  return {
    inline_keyboard: [
      [
        { text: label("uz", "lang_name_uz"), callback_data: "lang:uz" },
        { text: label("ru", "lang_name_ru"), callback_data: "lang:ru" },
        { text: label("en", "lang_name_en"), callback_data: "lang:en" },
      ],
    ],
  };
}

async function revealSenderToOwner(ownerId, messageDoc, ownerLang) {
  const lang = normalizeLang(ownerLang);
  const senderId = messageDoc.sender;
  const senderUser = await User.findOne({ userId: senderId }).lean().exec();

  const name = senderUser
    ? `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim()
    : "";
  const username = senderUser?.username ? `@${senderUser.username}` : "";

  const lines = [
    t(lang, "reveal_opened_title"),
    t(lang, "reveal_opened_id", { id: senderId }),
    name ? t(lang, "reveal_opened_name", { name }) : null,
    username ? t(lang, "reveal_opened_username", { username }) : null,
  ].filter(Boolean);

  await bot.api.sendMessage(ownerId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, "btn_reply"), callback_data: `reply:${senderId}` }],
      ],
    },
  });
}

async function sendRevealInvoice(ownerId, messageId, ownerLang) {
  const lang = normalizeLang(ownerLang);
  const stars = REVEAL_STARS_COST;
  const payload = `reveal:${messageId}`;
  const prices = [{ label: t(lang, "invoice_price_label"), amount: stars }];

  return bot.api.sendInvoice(
    ownerId,
    t(lang, "invoice_title"),
    t(lang, "invoice_desc", { stars }),
    payload,
    "",
    "XTR",
    prices
  );
}

async function sendCopySafe(toChatId, fromChatId, msg, options, lang = "en") {
  const opts = options || {};
  try {
    return await bot.api.copyMessage(toChatId, fromChatId, msg.message_id, opts);
  } catch {
    const kind = getMessageKind(msg);
    const fallbackLang = normalizeLang(lang);
    if (kind === "text") {
      return bot.api.sendMessage(toChatId, msg.text || "", {
        ...opts,
        entities: msg.entities,
      });
    }
    if (kind === "photo") {
      const photo = Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1] : null;
      if (!photo?.file_id) throw new Error("Photo file_id topilmadi");
      return bot.api.sendPhoto(toChatId, photo.file_id, {
        ...opts,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
      });
    }
    if (kind === "video") {
      if (!msg.video?.file_id) throw new Error("Video file_id topilmadi");
      return bot.api.sendVideo(toChatId, msg.video.file_id, {
        ...opts,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
      });
    }
    if (kind === "document") {
      if (!msg.document?.file_id) throw new Error("Document file_id topilmadi");
      return bot.api.sendDocument(toChatId, msg.document.file_id, {
        ...opts,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
      });
    }
    if (kind === "sticker") {
      if (!msg.sticker?.file_id) throw new Error("Sticker file_id topilmadi");
      return bot.api.sendSticker(toChatId, msg.sticker.file_id, opts);
    }
    if (kind === "animation") {
      if (!msg.animation?.file_id) throw new Error("Animation file_id topilmadi");
      return bot.api.sendAnimation(toChatId, msg.animation.file_id, {
        ...opts,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
      });
    }
    if (kind === "voice") {
      if (!msg.voice?.file_id) throw new Error("Voice file_id topilmadi");
      return bot.api.sendVoice(toChatId, msg.voice.file_id, opts);
    }
    if (kind === "audio") {
      if (!msg.audio?.file_id) throw new Error("Audio file_id topilmadi");
      return bot.api.sendAudio(toChatId, msg.audio.file_id, {
        ...opts,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
      });
    }
    if (kind === "video_note") {
      if (!msg.video_note?.file_id) throw new Error("VideoNote file_id topilmadi");
      return bot.api.sendVideoNote(toChatId, msg.video_note.file_id, opts);
    }

    return bot.api.sendMessage(
      toChatId,
      msg.text ||
        msg.caption ||
        `[${t(fallbackLang, `kind_${kind === "unknown" ? "unknown" : kind}`)}]`,
      opts
    );
  }
}

/* ------------------ BOT BUYRUQLARI ------------------ */
// /getlink – Owner o'ziga xos havolasini oladi
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

// Telegram Payments talabiga ko'ra /paysupport bo'lishi kerak.
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

bot.command("lang", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const lang = ctx.state.lang || "en";
  await bot.api.sendMessage(chatId, t(lang, "lang_choose"), {
    reply_markup: buildLangKeyboard(lang, lang),
  });
});

bot.on("pre_checkout_query", async (ctx) => {
  try {
    await bot.api.answerPreCheckoutQuery(ctx.update.pre_checkout_query.id, true);
  } catch (err) {
    console.error("pre_checkout_query error:", err);
  }
});

// /start – Havoladan kirish va sessiya yaratish
bot.command("start", async (ctx) => {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  const param = (ctx.match || "").trim();
  if (!chatId || !fromId) return;
  const lang = ctx.state.lang || "en";

  if (!param) {
    await bot.api.sendMessage(chatId, t(lang, "start_no_param"));
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
      await revealSenderToOwner(chatId, messageDoc, lang);
      return;
    }

    await sendRevealInvoice(chatId, messageId, lang);
    return;
  }

  if (param.startsWith("owner_")) {
    const ownerIdFromParam = parseInt(param.replace("owner_", ""), 10);
    if (fromId === ownerIdFromParam) {
      await bot.api.sendMessage(chatId, t(lang, "start_owner_self"));
      console.log(`Owner ${fromId} o'z havolasi orqali tizimga kirgan.`);
    } else {
      try {
        await Session.findOneAndUpdate(
          { anonUserId: fromId },
          { ownerId: ownerIdFromParam },
          { upsert: true, new: true }
        );
        await bot.api.sendMessage(chatId, t(lang, "start_joined"));

        const ownerLang = await getUserLang(ownerIdFromParam, { fallback: "en" });
        await bot.api.sendMessage(
          ownerIdFromParam,
          t(ownerLang, "start_owner_notified")
        );
        console.log(
          `Sessiya yaratilgan: Anon ${fromId} -> Owner ${ownerIdFromParam}`
        );
      } catch (err) {
        console.error("Sessiyani saqlashda xatolik:", err);
        await bot.api.sendMessage(chatId, t(lang, "start_session_save_error"));
      }
    }
  } else {
    await bot.api.sendMessage(chatId, t(lang, "start_wrong_param"));
  }
});

/* ------------------ XABAR QABUL QILISH VA YO'NALTIRISH ------------------ */
// Xabarni saqlash va yo'naltirish qismi
bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const lang = ctx.state.lang || "en";
  try {
    // Successful payment (Stars) — reveal flow
    if (msg.successful_payment) {
      const payload = msg.successful_payment.invoice_payload;
      if (typeof payload === "string" && payload.startsWith("reveal:")) {
        const messageId = payload.split(":")[1];
        if (isValidMongoId(messageId)) {
          const messageDoc = await Message.findById(messageId).lean().exec();
          if (!messageDoc) {
            await bot.api.sendMessage(msg.chat.id, t(lang, "message_not_found"));
            return;
          }
          if (messageDoc.recipient !== msg.from.id) {
            await bot.api.sendMessage(msg.chat.id, t(lang, "payment_not_allowed"));
            return;
          }

          await Message.findByIdAndUpdate(messageId, {
            $set: {
              "reveal.purchased": true,
              "reveal.purchasedAt": new Date(),
              "reveal.stars": msg.successful_payment.total_amount,
              "reveal.telegramPaymentChargeId":
                msg.successful_payment.telegram_payment_charge_id,
            },
          }).catch((err) => console.error("Reveal update error:", err));

          await revealSenderToOwner(msg.chat.id, messageDoc, lang);
          return;
        }
      }
      return;
    }

    // Buyruqlar o'tkazib yuboriladi
    if (msg.text && msg.text.startsWith("/")) return;

    const fromId = msg.from?.id;
    const chatId = msg.chat?.id;
    if (!fromId || !chatId) return;

    const spamText = getSpamText(msg);
    if (spamGuard.isSpam({ text: spamText, userId: fromId })) {
      await bot.api.sendMessage(fromId, t(lang, "spam_blocked"));
      console.log(
        `Spam xabari bloklandi: Foydalanuvchi ${fromId}, xabar: "${spamText}"`
      );
      return;
    }

    // Xabarni saqlash va yo'naltirish uchun recipient aniqlanadi
    const replyEntry = await ReplyState.findOne({ ownerId: fromId }).lean().exec();

    let recipient = null;
    let session = null;
    if (replyEntry) {
      recipient = replyEntry.anonUserId;
    } else {
      session = await Session.findOne({ anonUserId: fromId }).lean().exec();
      if (session) recipient = session.ownerId;
    }

    if (!recipient) {
      // Noma'lum holat: foydalanuvchi hali sessiyaga kirmagan yoki reply holati yo'q.
      if (!msg.text && getMessageKind(msg) === "unknown") return;
      await bot.api.sendMessage(chatId, t(lang, "must_join_or_reply"));
      return;
    }

    if (recipient === fromId) {
      await bot.api.sendMessage(fromId, t(lang, "cannot_self_message"));
      console.log(
        `Foydalanuvchi ${fromId} o'ziga xabar yuborishga urinmoqda.`
      );
      return;
    }

    const kind = getMessageKind(msg);
    const timestamp = msg.date ? new Date(msg.date * 1000) : new Date();
    const messageRecord = new Message({
      sender: fromId,
      recipient,
      text: msg.text || msg.caption || "",
      kind,
      timestamp,
      tgChatId: chatId,
      tgMessageId: msg.message_id,
    });

    await messageRecord.save().catch((err) =>
      console.error("Xabarni saqlashda xatolik:", err)
    );

    // Xabarni yo'naltirish:
    if (replyEntry) {
      const targetAnonId = replyEntry.anonUserId;
      const anonLang = await getUserLang(targetAnonId, { fallback: "en" });
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t(anonLang, "btn_ask_again"),
                callback_data: `ask:${targetAnonId}`,
              },
              {
                text: t(anonLang, "btn_close_session"),
                callback_data: `close:${targetAnonId}`,
              },
              {
                text: t(anonLang, "btn_repeat"),
                callback_data: `repeat:${targetAnonId}`,
              },
            ],
          ],
        },
      };

      try {
        await sendCopySafe(targetAnonId, chatId, msg, options, anonLang);
      } catch (err) {
        console.error("sendCopySafe (owner->anon) xatolik:", err);
        const kindLabel = t(anonLang, `kind_${kind === "unknown" ? "unknown" : kind}`);
        const fallbackText =
          (msg.text || msg.caption || "").trim() || `[${kindLabel}]`;
        await bot.api.sendMessage(
          targetAnonId,
          t(anonLang, "reply_fallback_prefix", { text: fallbackText }),
          options
        );
      }

      await bot.api.sendMessage(chatId, t(lang, "reply_sent"));
      await ReplyState.deleteOne({ ownerId: fromId });
      console.log(`Owner ${fromId} javobi anonim ${targetAnonId} ga yuborildi.`);
      return;
    }

    // Anon -> Owner
    const ownerId = session?.ownerId || recipient;
    const ownerLang = await getUserLang(ownerId, { fallback: "en" });
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(ownerLang, "btn_reply"), callback_data: `reply:${fromId}` }],
          [
            {
              text: t(ownerLang, "btn_reveal", { stars: REVEAL_STARS_COST }),
              callback_data: `reveal:${messageRecord._id}`,
            },
          ],
        ],
      },
    };

    try {
      await sendCopySafe(ownerId, chatId, msg, options, ownerLang);
    } catch (err) {
      console.error("sendCopySafe (anon->owner) xatolik:", err);
      const kindLabel = t(ownerLang, `kind_${kind === "unknown" ? "unknown" : kind}`);
      await bot.api.sendMessage(
        ownerId,
        msg.text || msg.caption || `[${kindLabel}]`,
        options
      );
    }

    await bot.api.sendMessage(chatId, t(lang, "message_sent_to_owner"));
    console.log(`Anonim ${fromId} xabari owner ${ownerId} ga yuborildi.`);
  } catch (err) {
    console.error("Message handler error:", err);
  }
});



/* ------------------ CALLBACK QUERY HANDLER ------------------ */
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const ownerId = ctx.from.id;
  const callbackQueryId = ctx.callbackQuery.id;
  const lang = ctx.state.lang || "en";

  if (data.startsWith("lang:")) {
    const selectedRaw = data.split(":")[1];
    const selected = ["en", "ru", "uz"].includes(selectedRaw) ? selectedRaw : null;
    if (!selected) {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_error"),
      });
      return;
    }

    await User.updateOne(
      { userId: ownerId },
      { $set: { lang: selected, langSelected: true } },
      { upsert: true }
    ).catch((err) => console.error("Language update error:", err));
    cacheSetUserLang(ownerId, selected);

    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: t(selected, "lang_updated"),
    });

    try {
      await ctx.editMessageText(t(selected, "lang_choose"), {
        reply_markup: buildLangKeyboard(selected, selected),
      });
    } catch (err) {
      // Not fatal (message might be too old / not editable)
      console.warn("editMessageText (lang) failed:", err?.message || err);
    }
    return;
  }

  if (data.startsWith("reveal:")) {
    const messageId = data.split(":")[1];
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

    if (messageDoc.recipient !== ownerId) {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_no_permission"),
      });
      return;
    }

    if (messageDoc.reveal?.purchased) {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_already_revealed"),
      });
      await revealSenderToOwner(ownerId, messageDoc, lang);
      return;
    }

    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: t(lang, "cb_payment_required", { stars: REVEAL_STARS_COST }),
    });
    try {
      await sendRevealInvoice(ownerId, messageId, lang);
    } catch (err) {
      console.error("sendInvoice error:", err);
      await bot.api.sendMessage(ownerId, t(lang, "invoice_error"));
    }
    return;
  }

  if (data.startsWith("reply:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    const session = await Session.findOne({ anonUserId });
    if (session && session.ownerId === ownerId) {
      await ReplyState.findOneAndUpdate(
        { ownerId: ownerId },
        { anonUserId },
        { upsert: true, new: true }
      );
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_reply_prompt"),
      });
      await bot.api.sendMessage(ownerId, t(lang, "msg_reply_instruction"));
      console.log(
        `Owner ${ownerId} javob berish holatiga o'tdi (anon ${anonUserId}).`
      );
    } else {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_reply_not_allowed"),
      });
      console.log(
        `Javob berish rad etildi: Foydalanuvchi ${ownerId} anonim ${anonUserId} ga javob bera olmadi.`
      );
    }
  } else if (data.startsWith("ask:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: t(lang, "cb_ask_prompt"),
    });
    console.log(
      `Anonim ${anonUserId} uchun yangi savol yozilishi so'ralmoqda.`
    );
  } else if (data.startsWith("close:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    try {
      const session = await Session.findOne({ anonUserId }).lean().exec();
      if (!session) {
        await bot.api.answerCallbackQuery(callbackQueryId, {
          text: t(lang, "cb_session_not_found"),
        });
        return;
      }

      await Session.deleteOne({ anonUserId });
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_session_closed"),
      });

      const sessionOwnerId = session.ownerId;
      const ownerLang = await getUserLang(sessionOwnerId, { fallback: "en" });
      const anonLang = await getUserLang(anonUserId, { fallback: "en" });

      await bot.api.sendMessage(
        sessionOwnerId,
        t(ownerLang, "msg_session_closed_owner")
      );
      await bot.api.sendMessage(anonUserId, t(anonLang, "msg_session_closed_anon"));

      console.log(
        `Sessiya yopildi: Anon ${anonUserId} va Owner ${sessionOwnerId}.`
      );
    } catch (err) {
      console.error("Sessiyani yopishda xatolik:", err);
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: t(lang, "cb_error"),
      });
    }
  } else if (data.startsWith("repeat:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: t(lang, "cb_repeat_prompt"),
    });
    console.log(
      `Takrorlash: Owner ${ownerId} uchun anonim ${anonUserId} xabari qayta yuborilishi talab qilindi.`
    );
  }
});

async function handleUserStats(ctx) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;
  const lang = ctx.state.lang || "en";
  try {
    // Foydalanuvchi yuborgan xabarlar sonini hisoblash
    const messageCount = await Message.countDocuments({ sender: userId });
    // Foydalanuvchi qatnashgan sessiyalar: anonim sifatida
    const sessionsAsAnon = await Session.countDocuments({ anonUserId: userId });
    // Foydalanuvchi qatnashgan sessiyalar: owner sifatida
    const sessionsAsOwner = await Session.countDocuments({ ownerId: userId });
    // Foydalanuvchi yuborgan oxirgi xabarni aniqlash (faoliyat vaqti sifatida)
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
    console.log(
      `Foydalanuvchi ${userId} uchun analitika hisobotini ko'rsatish bajarildi.`
    );
  } catch (err) {
    console.error("Foydalanuvchi analitikasi so'rovida xatolik:", err);
    await bot.api.sendMessage(chatId, t(lang, "userstats_error"));
  }
}

bot.command("userstats", handleUserStats);
bot.command("stats", handleUserStats);
bot.command("stat", handleUserStats);

async function start() {
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const commandsFor = (lang) => [
    { command: "start", description: t(lang, "cmd_desc_start") },
    { command: "getlink", description: t(lang, "cmd_desc_getlink") },
    { command: "lang", description: t(lang, "cmd_desc_lang") },
    { command: "userstats", description: t(lang, "cmd_desc_userstats") },
    { command: "paysupport", description: t(lang, "cmd_desc_paysupport") },
  ];

  await bot.api.setMyCommands(commandsFor("en"));
  await bot.api.setMyCommands(commandsFor("en"), { language_code: "en" });
  await bot.api.setMyCommands(commandsFor("ru"), { language_code: "ru" });
  await bot.api.setMyCommands(commandsFor("uz"), { language_code: "uz" });

  bot.start();
  console.log("Bot started");
}

start().catch((err) => {
  console.error("Bot startup error:", err);
  process.exit(1);
});

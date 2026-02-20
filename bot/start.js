require("dotenv").config();
const { Bot } = require("grammy");
const mongoose = require("mongoose");
const { getMessageKind, getSpamText, isValidMongoId } = require("./lib/telegram");
const { createSpamGuard } = require("./lib/spamGuard");

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI .env da topilmadi");
}

/* ------------------ MODELLAR ------------------ */
// Foydalanuvchi ma'lumotlari: Telegram foydalanuvchi ID, ismi, familiyasi va username
const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true },
  firstName: String,
  lastName: String,
  username: String,
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
const PAY_SUPPORT_TEXT =
  process.env.PAY_SUPPORT_TEXT ||
  "Payment support: Telegram bot admini bilan bog'laning (misol: @your_admin).";

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN .env da topilmadi");
}
if (!botUsername) {
  console.warn("BOT_USERNAME .env da yo'q. /getlink havolasi to'g'ri chiqmasligi mumkin.");
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

async function revealSenderToOwner(ownerId, messageDoc) {
  const senderId = messageDoc.sender;
  const senderUser = await User.findOne({ userId: senderId }).lean().exec();

  const name = senderUser
    ? `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim()
    : "";
  const username = senderUser?.username ? `@${senderUser.username}` : "";

  const lines = [
    "🔓 Kim yozgani ochildi:",
    `- ID: ${senderId}`,
    name ? `- Ism: ${name}` : null,
    username ? `- Username: ${username}` : null,
  ].filter(Boolean);

  await bot.api.sendMessage(ownerId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [[{ text: "Javob berish", callback_data: `reply:${senderId}` }]],
    },
  });
}

async function sendRevealInvoice(ownerId, messageId) {
  const stars = REVEAL_STARS_COST;
  const payload = `reveal:${messageId}`;
  const prices = [{ label: "Reveal sender", amount: stars }];

  return bot.api.sendInvoice(
    ownerId,
    "Kim yozganini ko‘rish",
    `${stars}⭐ evaziga ushbu anonim xabar yozuvchisi ko‘rsatiladi.`,
    payload,
    "",
    "XTR",
    prices
  );
}

async function sendCopySafe(toChatId, fromChatId, msg, options) {
  const opts = options || {};
  try {
    return await bot.api.copyMessage(toChatId, fromChatId, msg.message_id, opts);
  } catch {
    const kind = getMessageKind(msg);
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

    return bot.api.sendMessage(toChatId, msg.text || msg.caption || "[unsupported]", opts);
  }
}

/* ------------------ BOT BUYRUQLARI ------------------ */
// /getlink – Owner o'ziga xos havolasini oladi
bot.command("getlink", async (ctx) => {
  const chatId = ctx.chat?.id;
  const ownerId = ctx.from?.id;
  if (!chatId || !ownerId) return;

  const link = `https://t.me/${botUsername}?start=owner_${ownerId}`;
  await bot.api.sendMessage(
    chatId,
    `Sizning anonim chat havolangiz:\n${link}\nUshbu havola orqali boshqalar sizga anonim xabar yuborishi mumkin.`
  );
  console.log(`Owner ${ownerId} uchun havola yaratilgan: ${link}`);
});

// Telegram Payments talabiga ko'ra /paysupport bo'lishi kerak.
bot.command("paysupport", async (ctx) => {
  try {
    await bot.api.sendMessage(ctx.chat.id, PAY_SUPPORT_TEXT);
  } catch (err) {
    console.error("/paysupport xatolik:", err);
  }
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

  if (!param) {
    await bot.api.sendMessage(
      chatId,
      "Xush kelibsiz! Havoladan kirgan bo'lsangiz, iltimos, xabaringizni yuboring."
    );
    return;
  }

  if (param.startsWith("reveal_")) {
    const messageId = param.replace("reveal_", "");
    if (!isValidMongoId(messageId)) {
      await bot.api.sendMessage(chatId, "Noto'g'ri reveal parametri.");
      return;
    }

    const messageDoc = await Message.findById(messageId).lean().exec();
    if (!messageDoc) {
      await bot.api.sendMessage(chatId, "Xabar topilmadi.");
      return;
    }
    if (messageDoc.recipient !== fromId) {
      await bot.api.sendMessage(chatId, "Siz bu xabar uchun to'lov qila olmaysiz.");
      return;
    }

    if (messageDoc.reveal?.purchased) {
      await revealSenderToOwner(chatId, messageDoc);
      return;
    }

    await sendRevealInvoice(chatId, messageId);
    return;
  }

  if (param.startsWith("owner_")) {
    const ownerIdFromParam = parseInt(param.replace("owner_", ""), 10);
    if (fromId === ownerIdFromParam) {
      await bot.api.sendMessage(
        chatId,
        "Siz o'z anonim chat sessiyangizni boshqarayotgan egasiz."
      );
      console.log(`Owner ${fromId} o'z havolasi orqali tizimga kirgan.`);
    } else {
      try {
        await Session.findOneAndUpdate(
          { anonUserId: fromId },
          { ownerId: ownerIdFromParam },
          { upsert: true, new: true }
        );
        await bot.api.sendMessage(
          chatId,
          "Siz anonim xabar yuborish sessiyasiga qo'shildingiz. Iltimos, xabaringizni yuboring."
        );
        await bot.api.sendMessage(
          ownerIdFromParam,
          "Sizning sessiyangizga yangi anonim ishtirokchi qo'shildi."
        );
        console.log(
          `Sessiya yaratilgan: Anon ${fromId} -> Owner ${ownerIdFromParam}`
        );
      } catch (err) {
        console.error("Sessiyani saqlashda xatolik:", err);
        await bot.api.sendMessage(
          chatId,
          "Sessiyani saqlashda muammo yuz berdi. Iltimos, keyinroq urinib ko'ring."
        );
      }
    }
  } else {
    await bot.api.sendMessage(
      chatId,
      "Noto'g'ri parametr formati. Iltimos, havoladan foydalaning."
    );
  }
});

/* ------------------ XABAR QABUL QILISH VA YO'NALTIRISH ------------------ */
// Xabarni saqlash va yo'naltirish qismi
bot.on("message", async (ctx) => {
  const msg = ctx.message;
  try {
    // Successful payment (Stars) — reveal flow
    if (msg.successful_payment) {
      const payload = msg.successful_payment.invoice_payload;
      if (typeof payload === "string" && payload.startsWith("reveal:")) {
        const messageId = payload.split(":")[1];
        if (isValidMongoId(messageId)) {
          const messageDoc = await Message.findById(messageId).lean().exec();
          if (!messageDoc) {
            await bot.api.sendMessage(msg.chat.id, "Xabar topilmadi.");
            return;
          }
          if (messageDoc.recipient !== msg.from.id) {
            await bot.api.sendMessage(
              msg.chat.id,
              "Siz bu xabar uchun to'lov qila olmaysiz."
            );
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

          await revealSenderToOwner(msg.chat.id, messageDoc);
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
      await bot.api.sendMessage(fromId, "Xabaringiz spam deb aniqlandi va yuborilmadi.");
      console.log(
        `Spam xabari bloklandi: Foydalanuvchi ${fromId}, xabar: "${spamText}"`
      );
      return;
    }

    // Foydalanuvchi ma'lumotlarini yangilash/saqlash
    User.findOneAndUpdate(
      { userId: fromId },
      {
        userId: fromId,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
        username: msg.from.username,
      },
      { upsert: true, new: true }
    ).catch((err) =>
      console.error("Foydalanuvchi ma'lumotlarini saqlashda xatolik:", err)
    );

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
      await bot.api.sendMessage(
        chatId,
        "Xabar yuborish uchun avval havola orqali sessiyaga kiring yoki owner bo'lsangiz xabardagi \"Javob berish\" tugmasini bosing."
      );
      return;
    }

    if (recipient === fromId) {
      await bot.api.sendMessage(
        fromId,
        "Siz o'zingizni havolangiz uchun o'zingiz habar yubora olmaysiz."
      );
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
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Yana savol berish", callback_data: `ask:${targetAnonId}` },
              { text: "Sessiyani yopish", callback_data: `close:${targetAnonId}` },
              { text: "Takrorlash", callback_data: `repeat:${targetAnonId}` },
            ],
          ],
        },
      };

      try {
        await sendCopySafe(targetAnonId, chatId, msg, options);
      } catch (err) {
        console.error("sendCopySafe (owner->anon) xatolik:", err);
        await bot.api.sendMessage(
          targetAnonId,
          `Sizga javob: ${msg.text || msg.caption || "[media]"}`
        );
      }

      await bot.api.sendMessage(chatId, "Sizning javobingiz muvaffaqiyatli yuborildi.");
      await ReplyState.deleteOne({ ownerId: fromId });
      console.log(`Owner ${fromId} javobi anonim ${targetAnonId} ga yuborildi.`);
      return;
    }

    // Anon -> Owner
    const ownerId = session?.ownerId || recipient;
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Javob berish", callback_data: `reply:${fromId}` }],
          [
            {
              text: `Kim yozganini ko'rish (${REVEAL_STARS_COST}⭐)`,
              callback_data: `reveal:${messageRecord._id}`,
            },
          ],
        ],
      },
    };

    try {
      await sendCopySafe(ownerId, chatId, msg, options);
    } catch (err) {
      console.error("sendCopySafe (anon->owner) xatolik:", err);
      await bot.api.sendMessage(ownerId, msg.text || msg.caption || "[media]", options);
    }

    await bot.api.sendMessage(chatId, "Xabaringiz ownerga yuborildi.");
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

  if (data.startsWith("reveal:")) {
    const messageId = data.split(":")[1];
    if (!isValidMongoId(messageId)) {
      await bot.api.answerCallbackQuery(callbackQueryId, { text: "Noto'g'ri ID." });
      return;
    }

    const messageDoc = await Message.findById(messageId).lean().exec();
    if (!messageDoc) {
      await bot.api.answerCallbackQuery(callbackQueryId, { text: "Xabar topilmadi." });
      return;
    }

    if (messageDoc.recipient !== ownerId) {
      await bot.api.answerCallbackQuery(callbackQueryId, { text: "Ruxsat yo'q." });
      return;
    }

    if (messageDoc.reveal?.purchased) {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: "Allaqachon ochilgan ✅",
      });
      await revealSenderToOwner(ownerId, messageDoc);
      return;
    }

    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: `${REVEAL_STARS_COST}⭐ to'lov kerak`,
    });
    try {
      await sendRevealInvoice(ownerId, messageId);
    } catch (err) {
      console.error("sendInvoice error:", err);
      await bot.api.sendMessage(
        ownerId,
        "To'lov yaratishda xatolik. Keyinroq urinib ko'ring."
      );
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
        text: "Iltimos, javobingizni yuboring.",
      });
      await bot.api.sendMessage(
        ownerId,
        "Endi javobingizni yozing va yuboring. Bu xabar anonim foydalanuvchiga yuboriladi."
      );
      console.log(
        `Owner ${ownerId} javob berish holatiga o'tdi (anon ${anonUserId}).`
      );
    } else {
      await bot.api.answerCallbackQuery(callbackQueryId, {
        text: "Siz bu xabarga javob bera olmaysiz.",
      });
      console.log(
        `Javob berish rad etildi: Foydalanuvchi ${ownerId} anonim ${anonUserId} ga javob bera olmadi.`
      );
    }
  } else if (data.startsWith("ask:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: "Iltimos, yangi savolingizni yozing.",
    });
    console.log(
      `Anonim ${anonUserId} uchun yangi savol yozilishi so'ralmoqda.`
    );
  } else if (data.startsWith("close:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    try {
      await Session.deleteOne({ anonUserId });
      await bot.api.answerCallbackQuery(callbackQueryId, { text: "Sessiya yopildi." });
      await bot.api.sendMessage(ownerId, "Sessiya muvaffaqiyatli yopildi.");
      await bot.api.sendMessage(anonUserId, "Sizning sessiyangiz yopildi.");
      console.log(`Sessiya yopildi: Anon ${anonUserId} va Owner ${ownerId}.`);
    } catch (err) {
      console.error("Sessiyani yopishda xatolik:", err);
      await bot.api.answerCallbackQuery(callbackQueryId, { text: "Xatolik yuz berdi." });
    }
  } else if (data.startsWith("repeat:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: "Iltimos, xabaringizni qayta yuboring.",
    });
    await bot.api.sendMessage(
      ownerId,
      "Xabarni qayta yuboring yoki uni tahrirlab yuboring."
    );
    console.log(
      `Takrorlash: Owner ${ownerId} uchun anonim ${anonUserId} xabari qayta yuborilishi talab qilindi.`
    );
  }
});

bot.command("userstats", async (ctx) => {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;
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
    const lastActivity = lastMessage
      ? lastMessage.timestamp
      : "Hali xabar yuborilmagan";

    // Hisobotni tayyorlash
    const analyticsReport = `Siz haqingizdagi analitika:
- Yuborilgan xabarlar soni: ${messageCount}
- Sessiyalar (anon sifatida): ${sessionsAsAnon}
- Sessiyalar (owner sifatida): ${sessionsAsOwner}
- Oxirgi faoliyat vaqti: ${lastActivity}`;

    await bot.api.sendMessage(chatId, analyticsReport);
    console.log(
      `Foydalanuvchi ${userId} uchun analitika hisobotini ko'rsatish bajarildi.`
    );
  } catch (err) {
    console.error("Foydalanuvchi analitikasi so'rovida xatolik:", err);
    await bot.api.sendMessage(
      chatId,
      "Foydalanuvchi analitikasini ko'rsatishda xatolik yuz berdi."
    );
  }
});

async function start() {
  await mongoose.connect(mongoUri);
  console.log("MongoDB bilan muvaffaqiyatli bog'landik");

  bot.start();
  console.log("Bot ishga tushdi");
}

start().catch((err) => {
  console.error("Bot startup error:", err);
  process.exit(1);
});

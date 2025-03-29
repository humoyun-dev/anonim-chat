require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

// MongoDB ga ulanish
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB bilan muvaffaqiyatli bog'landik"))
  .catch((err) => console.error("MongoDB ga ulanishda xatolik:", err));

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
  text: { type: String, required: true },
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
const bot = new TelegramBot(token, { polling: true });

// Spam filtrlash uchun kalit so'zlar ro'yxati
const bannedWords = ["badword1", "badword2", "spamphrase"];
// Rate limiting: foydalanuvchi yuborgan xabarlar vaqtlarini saqlash
const userMessageTimestamps = {};

function isSpam(text, userId) {
  // Kalit so'zlar bo'yicha tekshirish
  for (let word of bannedWords) {
    if (text.toLowerCase().includes(word)) {
      console.log(
        `Foydalanuvchi ${userId} xabarida taqiqlangan so'z aniqlandi: ${word}`
      );
      return true;
    }
  }
  // Rate limiting: 10 soniyada 5 dan ortiq xabar yuborilsa spam deb hisoblanadi
  const now = Date.now();
  userMessageTimestamps[userId] = userMessageTimestamps[userId] || [];
  userMessageTimestamps[userId] = userMessageTimestamps[userId].filter(
    (ts) => now - ts < 10000
  );
  userMessageTimestamps[userId].push(now);
  if (userMessageTimestamps[userId].length > 5) {
    console.log(
      `Foydalanuvchi ${userId} 10 soniya ichida ${userMessageTimestamps[userId].length} xabar yubordi (spam).`
    );
    return true;
  }
  return false;
}

/* ------------------ BOT BUYRUQLARI ------------------ */
// /getlink – Owner o'ziga xos havolasini oladi
bot.onText(/\/getlink/, (msg) => {
  const chatId = msg.chat.id;
  const ownerId = msg.from.id;
  const link = `https://t.me/${botUsername}?start=owner_${ownerId}`;
  bot.sendMessage(
    chatId,
    `Sizning anonim chat havolangiz:\n${link}\nUshbu havola orqali boshqalar sizga anonim xabar yuborishi mumkin.`
  );
  console.log(`Owner ${ownerId} uchun havola yaratilgan: ${link}`);
});

// /start – Havoladan kirish va sessiya yaratish
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = match[1];

  if (!param) {
    bot.sendMessage(
      chatId,
      "Xush kelibsiz! Havoladan kirgan bo'lsangiz, iltimos, xabaringizni yuboring."
    );
    return;
  }

  if (param.startsWith("owner_")) {
    const ownerIdFromParam = parseInt(param.replace("owner_", ""), 10);
    if (msg.from.id === ownerIdFromParam) {
      bot.sendMessage(
        chatId,
        "Siz o'z anonim chat sessiyangizni boshqarayotgan egasiz."
      );
      console.log(`Owner ${msg.from.id} o'z havolasi orqali tizimga kirgan.`);
    } else {
      try {
        await Session.findOneAndUpdate(
          { anonUserId: msg.from.id },
          { ownerId: ownerIdFromParam },
          { upsert: true, new: true }
        );
        bot.sendMessage(
          chatId,
          "Siz anonim xabar yuborish sessiyasiga qo'shildingiz. Iltimos, xabaringizni yuboring."
        );
        bot.sendMessage(
          ownerIdFromParam,
          "Sizning sessiyangizga yangi anonim ishtirokchi qo'shildi."
        );
        console.log(
          `Sessiya yaratilgan: Anon ${msg.from.id} -> Owner ${ownerIdFromParam}`
        );
      } catch (err) {
        console.error("Sessiyani saqlashda xatolik:", err);
        bot.sendMessage(
          chatId,
          "Sessiyani saqlashda muammo yuz berdi. Iltimos, keyinroq urinib ko'ring."
        );
      }
    }
  } else {
    bot.sendMessage(
      chatId,
      "Noto'g'ri parametr formati. Iltimos, havoladan foydalaning."
    );
  }
});

/* ------------------ XABAR QABUL QILISH VA YO'NALTIRISH ------------------ */
// Xabarni saqlash va yo'naltirish qismi
bot.on("message", async (msg) => {
  // Buyruqlar va /start xabarlari o'tkazib yuboriladi
  if (!msg.text || msg.text.startsWith("/")) return;

  const fromId = msg.from.id;
  const chatId = msg.chat.id;

  // Spam tekshiruvi
  if (isSpam(msg.text, fromId)) {
    bot.sendMessage(fromId, "Xabaringiz spam deb aniqlandi va yuborilmadi.");
    console.log(`Spam xabari bloklandi: Foydalanuvchi ${fromId}, xabar: "${msg.text}"`);
    return;
  }

  // Foydalanuvchi ma'lumotlarini yangilash/saqlash
  try {
    await User.findOneAndUpdate(
      { userId: fromId },
      {
        userId: fromId,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
        username: msg.from.username
      },
      { upsert: true, new: true }
    );
    console.log(`Foydalanuvchi ${fromId} ma'lumotlari muvaffaqiyatli saqlandi.`);
  } catch (err) {
    console.error("Foydalanuvchi ma'lumotlarini saqlashda xatolik:", err);
  }

  // Xabarni saqlash va yo'naltirish uchun recipient aniqlanadi
  let recipient = null;
  const replyEntry = await ReplyState.findOne({ ownerId: fromId });
  if (replyEntry) {
    recipient = replyEntry.anonUserId;
  } else {
    const session = await Session.findOne({ anonUserId: fromId });
    if (session) {
      recipient = session.ownerId;
    }
  }
  
  // Agar recipient aniqlansa, ammo u yuboruvchi bilan bir xil bo'lsa, ogohlantirish chiqaramiz
  if (recipient && recipient === fromId) {
    bot.sendMessage(fromId, "Siz o'zingizni havolangiz uchun o'zingiz habar yubora olmaysiz.");
    console.log(`Foydalanuvchi ${fromId} o'ziga xabar yuborishga urinmoqda. Ogohlantirish chiqarildi.`);
    return;
  }

  if (recipient) {
    const messageRecord = new Message({
      sender: fromId,
      recipient: recipient,
      text: msg.text
    });
    try {
      await messageRecord.save();
      console.log(`Xabar muvaffaqiyatli saqlandi: ${fromId} -> ${recipient}, xabar: "${msg.text}"`);
    } catch (err) {
      console.error("Xabarni saqlashda xatolik:", err);
    }
  }

  // Xabarni yo'naltirish:
  if (replyEntry) {
    const targetAnonId = replyEntry.anonUserId;
    // Owner javobi uchun inline tugmalar: Yana savol berish, Sessiyani yopish, Takrorlash
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Yana savol berish", callback_data: `ask:${targetAnonId}` },
            { text: "Sessiyani yopish", callback_data: `close:${targetAnonId}` },
            { text: "Takrorlash", callback_data: `repeat:${targetAnonId}` }
          ]
        ]
      }
    };
    bot.sendMessage(targetAnonId, `Sizga javob: ${msg.text}`, options);
    bot.sendMessage(chatId, "Sizning javobingiz muvaffaqiyatli yuborildi.");
    await ReplyState.deleteOne({ ownerId: fromId });
    console.log(`Owner ${fromId} javobi anonim ${targetAnonId} ga yuborildi.`);
    return;
  } else if (await Session.findOne({ anonUserId: fromId })) {
    const session = await Session.findOne({ anonUserId: fromId });
    const ownerId = session.ownerId;
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Javob berish", callback_data: `reply:${fromId}` }]
        ]
      }
    };
    bot.sendMessage(ownerId, `Anonim xabar: ${msg.text}`, options);
    bot.sendMessage(chatId, "Xabaringiz ownerga yuborildi.");
    console.log(`Anonim ${fromId} xabari owner ${ownerId} ga yuborildi.`);
  }
});



/* ------------------ CALLBACK QUERY HANDLER ------------------ */
bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const ownerId = callbackQuery.from.id;

  if (data.startsWith("reply:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    const session = await Session.findOne({ anonUserId });
    if (session && session.ownerId === ownerId) {
      await ReplyState.findOneAndUpdate(
        { ownerId: ownerId },
        { anonUserId },
        { upsert: true, new: true }
      );
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Iltimos, javobingizni yuboring.",
      });
      bot.sendMessage(
        ownerId,
        "Endi javobingizni yozing va yuboring. Bu xabar anonim foydalanuvchiga yuboriladi."
      );
      console.log(
        `Owner ${ownerId} javob berish holatiga o'tdi (anon ${anonUserId}).`
      );
    } else {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Siz bu xabarga javob bera olmaysiz.",
      });
      console.log(
        `Javob berish rad etildi: Foydalanuvchi ${ownerId} anonim ${anonUserId} ga javob bera olmadi.`
      );
    }
  } else if (data.startsWith("ask:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Iltimos, yangi savolingizni yozing.",
    });
    console.log(
      `Anonim ${anonUserId} uchun yangi savol yozilishi so'ralmoqda.`
    );
  } else if (data.startsWith("close:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    try {
      await Session.deleteOne({ anonUserId });
      bot.answerCallbackQuery(callbackQuery.id, { text: "Sessiya yopildi." });
      bot.sendMessage(ownerId, "Sessiya muvaffaqiyatli yopildi.");
      bot.sendMessage(anonUserId, "Sizning sessiyangiz yopildi.");
      console.log(`Sessiya yopildi: Anon ${anonUserId} va Owner ${ownerId}.`);
    } catch (err) {
      console.error("Sessiyani yopishda xatolik:", err);
      bot.answerCallbackQuery(callbackQuery.id, { text: "Xatolik yuz berdi." });
    }
  } else if (data.startsWith("repeat:")) {
    const anonUserId = parseInt(data.split(":")[1], 10);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Iltimos, xabaringizni qayta yuboring.",
    });
    bot.sendMessage(
      ownerId,
      "Xabarni qayta yuboring yoki uni tahrirlab yuboring."
    );
    console.log(
      `Takrorlash: Owner ${ownerId} uchun anonim ${anonUserId} xabari qayta yuborilishi talab qilindi.`
    );
  }
});

bot.onText(/\/userstats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
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

    bot.sendMessage(chatId, analyticsReport);
    console.log(
      `Foydalanuvchi ${userId} uchun analitika hisobotini ko'rsatish bajarildi.`
    );
  } catch (err) {
    console.error("Foydalanuvchi analitikasi so'rovida xatolik:", err);
    bot.sendMessage(
      chatId,
      "Foydalanuvchi analitikasini ko'rsatishda xatolik yuz berdi."
    );
  }
});

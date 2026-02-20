const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: Number, required: true },
  recipient: { type: Number, required: true },
  kind: { type: String, default: "text" },
  text: { type: String, default: "" },
  tgChatId: Number,
  tgMessageId: Number,
  reveal: {
    purchased: { type: Boolean, default: false },
    purchasedAt: Date,
    stars: Number,
    telegramPaymentChargeId: String,
  },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);

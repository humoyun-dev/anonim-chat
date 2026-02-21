function createMessageModel(mongoose) {
  if (mongoose.models.Message) return mongoose.models.Message;

  const messageSchema = new mongoose.Schema({
    sender: { type: Number, required: true },
    recipient: { type: Number, required: true },
    roomKey: { type: String, required: true },
    kind: { type: String, default: "text" }, // text/photo/video/document/sticker/...
    text: { type: String, default: "" }, // text or caption
    tgChatId: Number,
    tgMessageId: Number,
    fwdChatId: Number, // chat_id where the bot forwarded this msg (recipient's chat)
    fwdMessageId: Number, // message_id of the forwarded copy in recipient's chat
    mediaFileId: { type: String, default: null }, // Telegram file_id for media
    mediaThumbFileId: { type: String, default: null }, // file_id for thumbnail (video/sticker/doc)
    reactions: { type: Map, of: Number, default: () => ({}) }, // combined: { "👍": 2 }
    senderReaction: { type: String, default: null }, // emoji the sender placed
    recipientReaction: { type: String, default: null }, // emoji the recipient placed
    reveal: {
      purchased: { type: Boolean, default: false },
      purchasedAt: Date,
      stars: Number,
      telegramPaymentChargeId: String,
      providerPaymentChargeId: String,
    },
    timestamp: { type: Date, default: Date.now },
  });

  messageSchema.index({ roomKey: 1, timestamp: 1, _id: 1 });
  messageSchema.index({ timestamp: -1, _id: -1 });
  messageSchema.index({ sender: 1, timestamp: -1, _id: -1 });
  messageSchema.index({ fwdChatId: 1, fwdMessageId: 1 }, { sparse: true });
  messageSchema.index(
    { "reveal.telegramPaymentChargeId": 1 },
    { unique: true, sparse: true },
  );

  return mongoose.model("Message", messageSchema);
}

module.exports = { createMessageModel };

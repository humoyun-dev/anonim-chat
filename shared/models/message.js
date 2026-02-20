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
  messageSchema.index(
    { "reveal.telegramPaymentChargeId": 1 },
    { unique: true, sparse: true }
  );

  return mongoose.model("Message", messageSchema);
}

module.exports = { createMessageModel };


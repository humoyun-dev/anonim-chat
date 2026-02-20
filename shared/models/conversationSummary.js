function createConversationSummaryModel(mongoose) {
  if (mongoose.models.ConversationSummary) return mongoose.models.ConversationSummary;

  const conversationSummarySchema = new mongoose.Schema(
    {
      roomKey: { type: String, required: true, unique: true },
      userA: { type: Number, required: true },
      userB: { type: Number, required: true },
      lastMessageId: { type: mongoose.Schema.Types.ObjectId, required: true },
      lastMessageAt: { type: Date, required: true },
      lastMessageText: { type: String, default: "" },
      lastKind: { type: String, default: "text" },
      lastSender: { type: Number, required: true },
      updatedAt: { type: Date, default: Date.now },
    },
    { collection: "conversation_summaries" }
  );

  conversationSummarySchema.index({ lastMessageAt: -1, lastMessageId: -1 });
  conversationSummarySchema.index({ userA: 1, userB: 1 });

  return mongoose.model("ConversationSummary", conversationSummarySchema);
}

module.exports = { createConversationSummaryModel };


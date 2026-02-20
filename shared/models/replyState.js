function createReplyStateModel(mongoose, { ttlSeconds = 15 * 60 } = {}) {
  if (mongoose.models.ReplyState) return mongoose.models.ReplyState;

  const replySchema = new mongoose.Schema({
    ownerId: { type: Number, required: true, unique: true },
    anonUserId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, expires: ttlSeconds },
  });

  replySchema.index({ anonUserId: 1 });

  return mongoose.model("ReplyState", replySchema);
}

module.exports = { createReplyStateModel };


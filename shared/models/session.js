function createSessionModel(mongoose) {
  if (mongoose.models.Session) return mongoose.models.Session;

  const sessionSchema = new mongoose.Schema({
    anonUserId: { type: Number, required: true, unique: true },
    ownerId: { type: Number, required: true },
  });

  sessionSchema.index({ ownerId: 1 });

  return mongoose.model("Session", sessionSchema);
}

module.exports = { createSessionModel };


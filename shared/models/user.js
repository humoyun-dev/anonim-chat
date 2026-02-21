function createUserModel(mongoose) {
  if (mongoose.models.User) return mongoose.models.User;

  const userSchema = new mongoose.Schema(
    {
      userId: { type: Number, unique: true, required: true },
      firstName: String,
      lastName: String,
      username: String,
      telegramLang: String,
      lang: { type: String, enum: ["en", "ru", "uz"], default: "en" },
      langSelected: { type: Boolean, default: false },
    },
    { timestamps: true },
  );

  return mongoose.model("User", userSchema);
}

module.exports = { createUserModel };

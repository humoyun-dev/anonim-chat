const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true },
  firstName: String,
  lastName: String,
  username: String,
});

module.exports = mongoose.model("User", userSchema);
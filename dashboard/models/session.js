const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  anonUserId: { type: Number, required: true, unique: true },
  ownerId: { type: Number, required: true },
});

module.exports = mongoose.model("Session", sessionSchema);

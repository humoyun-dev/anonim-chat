const mongoose = require("mongoose");

const replySchema = new mongoose.Schema({
  ownerId: { type: Number, required: true, unique: true },
  anonUserId: { type: Number, required: true },
});

module.exports = mongoose.model("ReplyState", replySchema);

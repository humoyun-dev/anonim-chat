const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: Number, required: true },
  recipient: { type: Number, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);

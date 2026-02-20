function getMessageKind(msg) {
  if (msg?.text) return "text";
  if (msg?.photo) return "photo";
  if (msg?.video) return "video";
  if (msg?.document) return "document";
  if (msg?.sticker) return "sticker";
  if (msg?.animation) return "animation";
  if (msg?.voice) return "voice";
  if (msg?.audio) return "audio";
  if (msg?.video_note) return "video_note";
  return "unknown";
}

function getSpamText(msg) {
  return msg?.text || msg?.caption || "";
}

function isValidMongoId(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

module.exports = {
  getMessageKind,
  getSpamText,
  isValidMongoId,
};


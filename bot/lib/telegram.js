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

/**
 * Extract the best file_id and optional thumbnail file_id from a Telegram message.
 * Returns { fileId: string|null, thumbFileId: string|null }
 */
function getMediaFileId(msg) {
  if (!msg) return { fileId: null, thumbFileId: null };
  if (msg.photo) {
    // photos come as an array of sizes — take the largest
    const largest = msg.photo[msg.photo.length - 1];
    return { fileId: largest?.file_id || null, thumbFileId: null };
  }
  if (msg.video)
    return {
      fileId: msg.video.file_id || null,
      thumbFileId: msg.video.thumbnail?.file_id || null,
    };
  if (msg.sticker)
    return {
      fileId: msg.sticker.file_id || null,
      thumbFileId: msg.sticker.thumbnail?.file_id || null,
    };
  if (msg.animation)
    return {
      fileId: msg.animation.file_id || null,
      thumbFileId: msg.animation.thumbnail?.file_id || null,
    };
  if (msg.document)
    return {
      fileId: msg.document.file_id || null,
      thumbFileId: msg.document.thumbnail?.file_id || null,
    };
  if (msg.voice)
    return { fileId: msg.voice.file_id || null, thumbFileId: null };
  if (msg.audio)
    return {
      fileId: msg.audio.file_id || null,
      thumbFileId: msg.audio.thumbnail?.file_id || null,
    };
  if (msg.video_note)
    return {
      fileId: msg.video_note.file_id || null,
      thumbFileId: msg.video_note.thumbnail?.file_id || null,
    };
  return { fileId: null, thumbFileId: null };
}

function getSpamText(msg) {
  return msg?.text || msg?.caption || "";
}

function isValidMongoId(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

module.exports = {
  getMessageKind,
  getMediaFileId,
  getSpamText,
  isValidMongoId,
};

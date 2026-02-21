const { normalizeLang, t } = require("./i18n");
const { getMessageKind } = require("./telegram");

function createMessageSender(bot) {
  async function sendCopySafe(toChatId, fromChatId, msg, options, lang = "en") {
    const opts = options || {};
    try {
      return await bot.api.copyMessage(
        toChatId,
        fromChatId,
        msg.message_id,
        opts,
      );
    } catch {
      const kind = getMessageKind(msg);
      const fallbackLang = normalizeLang(lang);
      if (kind === "text") {
        return bot.api.sendMessage(toChatId, msg.text || "", {
          ...opts,
          entities: msg.entities,
        });
      }
      if (kind === "photo") {
        const photo = Array.isArray(msg.photo)
          ? msg.photo[msg.photo.length - 1]
          : null;
        if (!photo?.file_id) throw new Error("Photo file_id topilmadi");
        return bot.api.sendPhoto(toChatId, photo.file_id, {
          ...opts,
          caption: msg.caption,
          caption_entities: msg.caption_entities,
        });
      }
      if (kind === "video") {
        if (!msg.video?.file_id) throw new Error("Video file_id topilmadi");
        return bot.api.sendVideo(toChatId, msg.video.file_id, {
          ...opts,
          caption: msg.caption,
          caption_entities: msg.caption_entities,
        });
      }
      if (kind === "document") {
        if (!msg.document?.file_id)
          throw new Error("Document file_id topilmadi");
        return bot.api.sendDocument(toChatId, msg.document.file_id, {
          ...opts,
          caption: msg.caption,
          caption_entities: msg.caption_entities,
        });
      }
      if (kind === "sticker") {
        if (!msg.sticker?.file_id) throw new Error("Sticker file_id topilmadi");
        return bot.api.sendSticker(toChatId, msg.sticker.file_id, opts);
      }
      if (kind === "animation") {
        if (!msg.animation?.file_id)
          throw new Error("Animation file_id topilmadi");
        return bot.api.sendAnimation(toChatId, msg.animation.file_id, {
          ...opts,
          caption: msg.caption,
          caption_entities: msg.caption_entities,
        });
      }
      if (kind === "voice") {
        if (!msg.voice?.file_id) throw new Error("Voice file_id topilmadi");
        return bot.api.sendVoice(toChatId, msg.voice.file_id, opts);
      }
      if (kind === "audio") {
        if (!msg.audio?.file_id) throw new Error("Audio file_id topilmadi");
        return bot.api.sendAudio(toChatId, msg.audio.file_id, {
          ...opts,
          caption: msg.caption,
          caption_entities: msg.caption_entities,
        });
      }
      if (kind === "video_note") {
        if (!msg.video_note?.file_id)
          throw new Error("VideoNote file_id topilmadi");
        return bot.api.sendVideoNote(toChatId, msg.video_note.file_id, opts);
      }

      return bot.api.sendMessage(
        toChatId,
        msg.text ||
          msg.caption ||
          `[${t(fallbackLang, `kind_${kind === "unknown" ? "unknown" : kind}`)}]`,
        opts,
      );
    }
  }

  return { sendCopySafe };
}

module.exports = { createMessageSender };

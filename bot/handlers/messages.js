const { t } = require("../lib/i18n");
const {
  getMessageKind,
  getMediaFileId,
  getSpamText,
  isValidMongoId,
} = require("../lib/telegram");
const { getRoomKey } = require("../lib/room");

function registerMessageHandler(bot, deps) {
  const {
    User,
    Message,
    Session,
    ReplyState,
    ConversationSummary,
    REVEAL_STARS_COST,
    getUserLang,
    spamGuard,
    paymentService,
    messageSender,
  } = deps;

  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    const lang = ctx.state.lang || "en";
    try {
      // Successful payment (Stars) — reveal flow
      if (msg.successful_payment) {
        const payload = msg.successful_payment.invoice_payload;
        if (typeof payload === "string" && payload.startsWith("reveal:")) {
          const messageId = payload.split(":")[1];
          if (isValidMongoId(messageId)) {
            const fromId = msg.from?.id;
            if (!fromId) return;

            const update = {
              $set: {
                "reveal.purchased": true,
                "reveal.purchasedAt": new Date(),
                "reveal.stars": msg.successful_payment.total_amount,
                "reveal.telegramPaymentChargeId":
                  msg.successful_payment.telegram_payment_charge_id,
                "reveal.providerPaymentChargeId":
                  msg.successful_payment.provider_payment_charge_id,
              },
            };

            const updated = await Message.findOneAndUpdate(
              {
                _id: messageId,
                recipient: fromId,
                "reveal.purchased": { $ne: true },
              },
              update,
              { new: true },
            )
              .lean()
              .exec()
              .catch((err) => {
                console.error("Reveal update error:", err);
                return null;
              });

            if (updated) {
              await paymentService.revealSenderToOwner(
                msg.chat.id,
                updated,
                lang,
              );
              return;
            }

            const existing = await Message.findById(messageId).lean().exec();
            if (!existing) {
              await bot.api.sendMessage(
                msg.chat.id,
                t(lang, "message_not_found"),
              );
              return;
            }
            if (existing.recipient !== fromId) {
              await bot.api.sendMessage(
                msg.chat.id,
                t(lang, "payment_not_allowed"),
              );
              return;
            }

            await paymentService.revealSenderToOwner(
              msg.chat.id,
              existing,
              lang,
            );
            return;
          }
        }
        return;
      }

      // Skip commands
      if (msg.text && msg.text.startsWith("/")) return;

      const fromId = msg.from?.id;
      const chatId = msg.chat?.id;
      if (!fromId || !chatId) return;

      const spamText = getSpamText(msg);
      if (spamGuard.isSpam({ text: spamText, userId: fromId })) {
        await bot.api.sendMessage(fromId, t(lang, "spam_blocked"));
        console.log(
          `Spam xabari bloklandi: Foydalanuvchi ${fromId}, xabar: "${spamText}"`,
        );
        return;
      }

      // Determine recipient
      const replyEntry = await ReplyState.findOne({ ownerId: fromId })
        .lean()
        .exec();

      let recipient = null;
      let session = null;
      if (replyEntry) {
        recipient = replyEntry.anonUserId;
      } else {
        session = await Session.findOne({ anonUserId: fromId }).lean().exec();
        if (session) recipient = session.ownerId;
      }

      if (!recipient) {
        if (!msg.text && getMessageKind(msg) === "unknown") return;
        await bot.api.sendMessage(chatId, t(lang, "must_join_or_reply"));
        return;
      }

      if (recipient === fromId) {
        await bot.api.sendMessage(fromId, t(lang, "cannot_self_message"));
        console.log(
          `Foydalanuvchi ${fromId} o'ziga xabar yuborishga urinmoqda.`,
        );
        return;
      }

      const kind = getMessageKind(msg);
      const { fileId: mediaFileId, thumbFileId: mediaThumbFileId } =
        getMediaFileId(msg);
      const timestamp = msg.date ? new Date(msg.date * 1000) : new Date();
      const roomKey = getRoomKey(fromId, recipient);
      const messageRecord = new Message({
        sender: fromId,
        recipient,
        roomKey,
        text: msg.text || msg.caption || "",
        kind,
        timestamp,
        tgChatId: chatId,
        tgMessageId: msg.message_id,
        mediaFileId: mediaFileId || undefined,
        mediaThumbFileId: mediaThumbFileId || undefined,
      });

      let didSave = true;
      try {
        await messageRecord.save();
      } catch (err) {
        didSave = false;
        console.error("Message save error:", err);
      }

      if (didSave) {
        const preview = (messageRecord.text || "").trim().slice(0, 180);
        const lastMessageText = preview || `[${kind}]`;
        await ConversationSummary.findOneAndUpdate(
          {
            roomKey,
            $or: [
              { lastMessageId: { $exists: false } },
              { lastMessageId: { $lt: messageRecord._id } },
            ],
          },
          {
            $set: {
              roomKey,
              userA: Math.min(fromId, recipient),
              userB: Math.max(fromId, recipient),
              lastMessageId: messageRecord._id,
              lastMessageAt: timestamp,
              lastMessageText,
              lastKind: kind,
              lastSender: fromId,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        ).catch((err) =>
          console.error("ConversationSummary upsert error:", err),
        );
      }

      // Owner -> Anon (reply)
      if (replyEntry) {
        const targetAnonId = replyEntry.anonUserId;
        const anonLang = await getUserLang(targetAnonId, { fallback: "en" });
        const options = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t(anonLang, "btn_ask_again"),
                  callback_data: `ask:${fromId}`,
                },
              ],
            ],
          },
        };

        try {
          const fwdResult = await messageSender.sendCopySafe(
            targetAnonId,
            chatId,
            msg,
            options,
            anonLang,
          );
          // Save fwd IDs so reactions on the anon's copy link back to this message
          if (fwdResult?.message_id && didSave) {
            await Message.updateOne(
              { _id: messageRecord._id },
              {
                $set: {
                  fwdChatId: targetAnonId,
                  fwdMessageId: fwdResult.message_id,
                },
              },
            ).catch((err) =>
              console.error("fwd ID save error (owner->anon):", err),
            );
            console.log(
              `[fwd] owner->anon: saved fwdChatId=${targetAnonId} fwdMessageId=${fwdResult.message_id}`,
            );
          }
        } catch (err) {
          console.error("sendCopySafe (owner->anon) xatolik:", err);
          const kindLabel = t(
            anonLang,
            `kind_${kind === "unknown" ? "unknown" : kind}`,
          );
          const fallbackText =
            (msg.text || msg.caption || "").trim() || `[${kindLabel}]`;
          await bot.api.sendMessage(
            targetAnonId,
            t(anonLang, "reply_fallback_prefix", { text: fallbackText }),
            options,
          );
        }

        await bot.api.sendMessage(chatId, t(lang, "reply_sent"));
        await ReplyState.deleteOne({ ownerId: fromId });

        // Auto-close session after owner's reply
        await Session.deleteOne({ anonUserId: targetAnonId }).catch((err) =>
          console.error("Auto-close session error:", err),
        );

        console.log(
          `Owner ${fromId} javobi anonim ${targetAnonId} ga yuborildi. Sessiya yopildi.`,
        );
        return;
      }

      // Anon -> Owner
      const ownerId = session?.ownerId || recipient;
      const ownerLang = await getUserLang(ownerId, { fallback: "en" });
      const inlineKeyboard = [
        [
          {
            text: t(ownerLang, "btn_reply"),
            callback_data: `reply:${fromId}`,
          },
        ],
      ];
      if (didSave) {
        inlineKeyboard.push([
          {
            text: t(ownerLang, "btn_reveal", { stars: REVEAL_STARS_COST }),
            callback_data: `reveal:${messageRecord._id}`,
          },
        ]);
      }
      const options = { reply_markup: { inline_keyboard: inlineKeyboard } };

      try {
        const fwdResult = await messageSender.sendCopySafe(
          ownerId,
          chatId,
          msg,
          options,
          ownerLang,
        );
        // Save forwarded message IDs so reactions on the owner's copy can be linked back
        if (fwdResult?.message_id && didSave) {
          await Message.updateOne(
            { _id: messageRecord._id },
            {
              $set: { fwdChatId: ownerId, fwdMessageId: fwdResult.message_id },
            },
          ).catch((err) =>
            console.error("fwd ID save error (anon->owner):", err),
          );
          console.log(
            `[fwd] anon->owner: saved fwdChatId=${ownerId} fwdMessageId=${fwdResult.message_id}`,
          );
        }
      } catch (err) {
        console.error("sendCopySafe (anon->owner) xatolik:", err);
        const kindLabel = t(
          ownerLang,
          `kind_${kind === "unknown" ? "unknown" : kind}`,
        );
        await bot.api.sendMessage(
          ownerId,
          msg.text || msg.caption || `[${kindLabel}]`,
          options,
        );
      }

      await bot.api.sendMessage(chatId, t(lang, "message_sent_to_owner"));

      // Auto-close session after anon sends — re-opened only via "Ask again" button
      await Session.deleteOne({ anonUserId: fromId }).catch((err) =>
        console.error("Session auto-close error:", err),
      );

      console.log(
        `Anonim ${fromId} xabari owner ${ownerId} ga yuborildi. Sessiya yopildi.`,
      );
    } catch (err) {
      console.error("Message handler error:", err);
    }
  });
}

module.exports = { registerMessageHandler };

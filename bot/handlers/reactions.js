/**
 * Handles Telegram message_reaction updates.
 *
 * Each message has two copies in Telegram:
 *   - tgChatId / tgMessageId   — the SENDER's chat
 *   - fwdChatId / fwdMessageId — the RECIPIENT's chat (forwarded copy)
 *
 * We track two separate reaction slots:
 *   senderReaction    — the emoji the message SENDER placed
 *   recipientReaction — the emoji the message RECIPIENT placed
 *
 * "reactions" Map stays as a combined view for the dashboard.
 *
 * When one side reacts, we mirror that single emoji to the other
 * side's copy via setMessageReaction (bot can set 1 reaction).
 *
 * To prevent infinite loops: we check reaction.user.id — if it equals
 * the bot's own ID, we skip (that's the bot's own mirror, not a human).
 */
function registerReactionHandler(bot, { Message }) {
  // Cache the bot's own user ID (resolved on first reaction)
  let botUserId = null;

  bot.on("message_reaction", async (ctx) => {
    try {
      // Resolve bot ID once
      if (!botUserId) {
        try {
          const me = await bot.api.getMe();
          botUserId = me.id;
        } catch {
          botUserId = 0; // fallback — won't match any real user
        }
      }

      const reaction = ctx.update?.message_reaction ?? ctx.messageReaction;
      if (!reaction) return;

      const chatId = reaction.chat?.id;
      const tgMsgId = reaction.message_id;
      const userId = reaction.user?.id;
      if (!chatId || !tgMsgId) return;

      // Skip reactions set by the bot itself (mirror echo)
      if (userId && userId === botUserId) {
        console.log(
          `[reaction] skipping bot's own reaction chat=${chatId} msg=${tgMsgId}`,
        );
        return;
      }

      const newReactions = reaction.new_reaction || [];
      const emoji = newReactions.find((r) => r.type === "emoji")?.emoji || null;

      console.log(
        `[reaction] chat=${chatId} msg=${tgMsgId} user=${userId ?? "?"}`,
        `emoji=${emoji || "(removed)"}`,
      );

      // Find the message — try fwd side first (recipient's chat), then original (sender's chat)
      let msg = await Message.findOne({
        fwdChatId: chatId,
        fwdMessageId: tgMsgId,
      }).lean();
      let reactorRole = "recipient";

      if (!msg) {
        msg = await Message.findOne({
          tgChatId: chatId,
          tgMessageId: tgMsgId,
        }).lean();
        reactorRole = "sender";
      }

      if (!msg) {
        console.warn(
          `[reaction] no message found for chat=${chatId} msg=${tgMsgId}`,
        );
        return;
      }

      // Determine which field to update
      const reactionField =
        reactorRole === "sender" ? "senderReaction" : "recipientReaction";
      const otherField =
        reactorRole === "sender" ? "recipientReaction" : "senderReaction";
      const otherEmoji = msg[otherField] || null;

      // Build combined reactions map for dashboard
      const reactionsMap = {};
      if (emoji) reactionsMap[emoji] = (reactionsMap[emoji] || 0) + 1;
      if (otherEmoji)
        reactionsMap[otherEmoji] = (reactionsMap[otherEmoji] || 0) + 1;

      // Update DB
      await Message.updateOne(
        { _id: msg._id },
        {
          $set: {
            [reactionField]: emoji,
            reactions: reactionsMap,
          },
        },
      );

      console.log(
        `[reaction] updated msg ${msg._id}: ${reactionField}=${emoji || "null"}`,
        reactionsMap,
      );

      // Mirror to the OTHER side's message copy
      try {
        const mirrorReaction = emoji ? [{ type: "emoji", emoji }] : [];

        if (reactorRole === "recipient" && msg.tgChatId && msg.tgMessageId) {
          await bot.api.raw.setMessageReaction({
            chat_id: msg.tgChatId,
            message_id: msg.tgMessageId,
            reaction: mirrorReaction,
          });
          console.log(
            `[reaction] mirrored to sender chat=${msg.tgChatId} msg=${msg.tgMessageId}`,
          );
        } else if (
          reactorRole === "sender" &&
          msg.fwdChatId &&
          msg.fwdMessageId
        ) {
          await bot.api.raw.setMessageReaction({
            chat_id: msg.fwdChatId,
            message_id: msg.fwdMessageId,
            reaction: mirrorReaction,
          });
          console.log(
            `[reaction] mirrored to recipient chat=${msg.fwdChatId} msg=${msg.fwdMessageId}`,
          );
        }
      } catch (err) {
        console.warn(
          `[reaction] mirror failed: ${err.description || err.message}`,
        );
      }
    } catch (err) {
      console.error("Reaction handler error:", err);
    }
  });
}

module.exports = { registerReactionHandler };

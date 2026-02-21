const { normalizeLang, t } = require("./i18n");

function createPaymentService({ bot, User, REVEAL_STARS_COST }) {
  async function revealSenderToOwner(ownerId, messageDoc, ownerLang) {
    const lang = normalizeLang(ownerLang);
    const senderId = messageDoc.sender;
    const senderUser = await User.findOne({ userId: senderId }).lean().exec();

    const name = senderUser
      ? `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim()
      : "";
    const username = senderUser?.username ? `@${senderUser.username}` : "";

    const lines = [
      t(lang, "reveal_opened_title"),
      t(lang, "reveal_opened_id", { id: senderId }),
      name ? t(lang, "reveal_opened_name", { name }) : null,
      username ? t(lang, "reveal_opened_username", { username }) : null,
    ].filter(Boolean);

    await bot.api.sendMessage(ownerId, lines.join("\n"), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t(lang, "btn_reply"),
              callback_data: `reply:${senderId}`,
            },
          ],
        ],
      },
    });
  }

  async function sendRevealInvoice(ownerId, messageId, ownerLang) {
    const lang = normalizeLang(ownerLang);
    const stars = REVEAL_STARS_COST;
    const payload = `reveal:${messageId}`;
    const prices = [{ label: t(lang, "invoice_price_label"), amount: stars }];

    return bot.api.sendInvoice(
      ownerId,
      t(lang, "invoice_title"),
      t(lang, "invoice_desc", { stars }),
      payload,
      "XTR",
      prices,
    );
  }

  return { revealSenderToOwner, sendRevealInvoice };
}

module.exports = { createPaymentService };

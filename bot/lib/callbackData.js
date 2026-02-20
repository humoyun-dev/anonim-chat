function parseCallbackData(data) {
  if (typeof data !== "string" || !data) return null;
  if (data === "cancel_reply") return { type: "cancel_reply" };

  const idx = data.indexOf(":");
  if (idx <= 0) return null;
  const type = data.slice(0, idx);
  const arg = data.slice(idx + 1);
  if (!arg) return null;

  if (type === "lang") return { type: "lang", lang: arg };
  if (type === "reveal") return { type: "reveal", messageId: arg };
  if (type === "reply") {
    const anonUserId = Number.parseInt(arg, 10);
    if (!Number.isFinite(anonUserId)) return null;
    return { type: "reply", anonUserId };
  }
  if (type === "ask" || type === "close" || type === "repeat") {
    const anonUserId = Number.parseInt(arg, 10);
    if (!Number.isFinite(anonUserId)) return null;
    return { type, anonUserId };
  }

  return null;
}

module.exports = { parseCallbackData };


function createSpamGuard({
  bannedWords = [],
  windowMs = 10_000,
  maxMessages = 5,
  staleMs = 60 * 60 * 1000,
} = {}) {
  const userMap = new Map();
  const normalizedBannedWords = bannedWords.map((w) => String(w).toLowerCase());

  function isSpam({ text, userId, now = Date.now() }) {
    const normalizedText = (text || "").toLowerCase();
    for (const word of normalizedBannedWords) {
      if (word && normalizedText.includes(word)) return true;
    }

    const entry = userMap.get(userId) || { timestamps: [], lastSeen: now };
    entry.lastSeen = now;
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    entry.timestamps.push(now);
    userMap.set(userId, entry);
    return entry.timestamps.length > maxMessages;
  }

  function cleanup(now = Date.now()) {
    for (const [userId, entry] of userMap.entries()) {
      if (!entry?.lastSeen || now - entry.lastSeen > staleMs) {
        userMap.delete(userId);
      }
    }
  }

  return { isSpam, cleanup };
}

module.exports = { createSpamGuard };


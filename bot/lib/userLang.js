const { normalizeLang } = require("./i18n");

const userLangCache = new Map();
const USER_LANG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheGetUserLang(userId) {
  const entry = userLangCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at > USER_LANG_CACHE_TTL_MS) {
    userLangCache.delete(userId);
    return null;
  }
  return entry.lang;
}

function cacheSetUserLang(userId, lang) {
  if (!userId) return;
  userLangCache.set(userId, { lang: normalizeLang(lang), at: Date.now() });
}

function createGetUserLang(User) {
  return async function getUserLang(
    userId,
    { fallback = "en", telegramHint } = {},
  ) {
    if (!userId) return normalizeLang(telegramHint || fallback);
    const cached = cacheGetUserLang(userId);
    if (cached) return cached;
    try {
      const user = await User.findOne({ userId })
        .select({ lang: 1, langSelected: 1, telegramLang: 1 })
        .lean()
        .exec();
      const resolved = normalizeLang(
        user?.langSelected
          ? user?.lang || fallback
          : telegramHint || user?.telegramLang || fallback,
      );
      cacheSetUserLang(userId, resolved);
      return resolved;
    } catch (err) {
      console.error("getUserLang error:", err);
      return normalizeLang(telegramHint || fallback);
    }
  };
}

module.exports = { cacheSetUserLang, createGetUserLang };

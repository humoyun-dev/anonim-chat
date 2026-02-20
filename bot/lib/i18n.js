const SUPPORTED_LANGS = ["en", "ru", "uz"];

function normalizeLang(code) {
  const raw = String(code || "").toLowerCase();
  if (raw.startsWith("ru")) return "ru";
  if (raw.startsWith("uz")) return "uz";
  if (raw.startsWith("en")) return "en";
  return "en";
}

const DICT = {
  en: require("../locales/en.json"),
  ru: require("../locales/ru.json"),
  uz: require("../locales/uz.json"),
};

function interpolate(template, params) {
  if (!params || typeof params !== "object") return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      const value = params[name];
      if (value === null || value === undefined) return "";
      return String(value);
    }
    return match;
  });
}

function t(lang, key, params = {}) {
  const normalized = normalizeLang(lang);
  const dict = DICT[normalized] || DICT.en;
  const entry = dict[key] ?? DICT.en[key];
  if (!entry) return key;
  return interpolate(entry, params);
}

function getPaySupportText(lang) {
  const normalized = normalizeLang(lang);
  const byLang =
    process.env[`PAY_SUPPORT_TEXT_${normalized.toUpperCase()}`] || "";
  if (byLang.trim()) return byLang.trim();

  const generic = process.env.PAY_SUPPORT_TEXT || "";
  if (generic.trim()) return generic.trim();

  return t(normalized, "pay_support_default");
}

module.exports = {
  SUPPORTED_LANGS,
  normalizeLang,
  t,
  getPaySupportText,
};

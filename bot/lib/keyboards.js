const { normalizeLang, t } = require("./i18n");

function buildLangKeyboard(currentLang, uiLang) {
  const current = normalizeLang(currentLang);
  const lang = normalizeLang(uiLang);
  const label = (code, key) => {
    const base = t(lang, key);
    return current === code ? `${base} ✅` : base;
  };
  return {
    inline_keyboard: [
      [
        { text: label("uz", "lang_name_uz"), callback_data: "lang:uz" },
        { text: label("ru", "lang_name_ru"), callback_data: "lang:ru" },
        { text: label("en", "lang_name_en"), callback_data: "lang:en" },
      ],
    ],
  };
}

function buildMainMenuKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        { text: t(lang, "btn_menu_getlink"), callback_data: "menu:getlink" },
        { text: t(lang, "btn_menu_lang"), callback_data: "menu:lang" },
      ],
      [
        { text: t(lang, "btn_menu_stats"), callback_data: "menu:stats" },
        {
          text: t(lang, "btn_menu_paysupport"),
          callback_data: "menu:paysupport",
        },
      ],
      [{ text: t(lang, "btn_menu_help"), callback_data: "menu:help" }],
    ],
  };
}

function buildBackMenuKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, "btn_back_menu"), callback_data: "menu:main" }],
    ],
  };
}

module.exports = {
  buildLangKeyboard,
  buildMainMenuKeyboard,
  buildBackMenuKeyboard,
};

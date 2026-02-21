const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeLang, t, getPaySupportText } = require("../lib/i18n");

test("normalizeLang supports uz/ru/en and falls back to en", () => {
  assert.equal(normalizeLang("ru"), "ru");
  assert.equal(normalizeLang("ru-RU"), "ru");
  assert.equal(normalizeLang("uz"), "uz");
  assert.equal(normalizeLang("uz-UZ"), "uz");
  assert.equal(normalizeLang("en"), "en");
  assert.equal(normalizeLang("en-US"), "en");
  assert.equal(normalizeLang("de"), "en");
  assert.equal(normalizeLang(null), "en");
});

test("t returns localized button labels", () => {
  assert.equal(t("en", "btn_reply"), "✏️ Reply");
  assert.equal(t("ru", "btn_reply"), "✏️ Ответить");
  assert.equal(t("uz", "btn_reply"), "✏️ Javob berish");
});

test("t returns localized kind labels", () => {
  assert.equal(t("en", "kind_sticker"), "sticker");
  assert.equal(t("ru", "kind_sticker"), "стикер");
  assert.equal(t("uz", "kind_sticker"), "stiker");
});

test("getPaySupportText prefers per-language env override", () => {
  const prev = {
    PAY_SUPPORT_TEXT_UZ: process.env.PAY_SUPPORT_TEXT_UZ,
    PAY_SUPPORT_TEXT: process.env.PAY_SUPPORT_TEXT,
  };

  try {
    process.env.PAY_SUPPORT_TEXT_UZ = "Uz support text";
    delete process.env.PAY_SUPPORT_TEXT;
    assert.equal(getPaySupportText("uz"), "Uz support text");
  } finally {
    if (prev.PAY_SUPPORT_TEXT_UZ === undefined)
      delete process.env.PAY_SUPPORT_TEXT_UZ;
    else process.env.PAY_SUPPORT_TEXT_UZ = prev.PAY_SUPPORT_TEXT_UZ;

    if (prev.PAY_SUPPORT_TEXT === undefined)
      delete process.env.PAY_SUPPORT_TEXT;
    else process.env.PAY_SUPPORT_TEXT = prev.PAY_SUPPORT_TEXT;
  }
});

test("getPaySupportText falls back to generic env var, then default", () => {
  const prev = {
    PAY_SUPPORT_TEXT_EN: process.env.PAY_SUPPORT_TEXT_EN,
    PAY_SUPPORT_TEXT: process.env.PAY_SUPPORT_TEXT,
  };

  try {
    delete process.env.PAY_SUPPORT_TEXT_EN;
    process.env.PAY_SUPPORT_TEXT = "Generic support text";
    assert.equal(getPaySupportText("en"), "Generic support text");

    delete process.env.PAY_SUPPORT_TEXT;
    assert.equal(getPaySupportText("en"), t("en", "pay_support_default"));
  } finally {
    if (prev.PAY_SUPPORT_TEXT_EN === undefined)
      delete process.env.PAY_SUPPORT_TEXT_EN;
    else process.env.PAY_SUPPORT_TEXT_EN = prev.PAY_SUPPORT_TEXT_EN;

    if (prev.PAY_SUPPORT_TEXT === undefined)
      delete process.env.PAY_SUPPORT_TEXT;
    else process.env.PAY_SUPPORT_TEXT = prev.PAY_SUPPORT_TEXT;
  }
});

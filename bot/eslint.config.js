const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["node_modules/**"],
  },
];


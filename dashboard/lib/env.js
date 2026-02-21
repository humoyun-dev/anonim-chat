function isStrongPassword(password) {
  const value = String(password || "");
  if (value.length < 12) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  return true;
}

function loadDashboardConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const config = {
    nodeEnv,
    isProduction,
    mongoUri: env.MONGODB_URI,
    sessionSecret: env.SESSION_SECRET,
    adminUser: env.ADMIN_USER,
    adminPass: env.ADMIN_PASS,
    trustProxy: env.TRUST_PROXY === "1",
    botToken: env.TELEGRAM_BOT_TOKEN || null,
    cookieSecure:
      env.COOKIE_SECURE === "1"
        ? true
        : env.COOKIE_SECURE === "0"
          ? false
          : undefined,
  };

  if (isProduction) {
    const missing = [];
    for (const key of [
      "MONGODB_URI",
      "SESSION_SECRET",
      "ADMIN_USER",
      "ADMIN_PASS",
    ]) {
      if (!env[key] || !String(env[key]).trim()) missing.push(key);
    }
    if (missing.length) {
      throw new Error(
        `Missing required env in production: ${missing.join(", ")}`,
      );
    }
    if (!isStrongPassword(env.ADMIN_PASS)) {
      throw new Error(
        "ADMIN_PASS is too weak. Requirements: >=12 chars, 1 upper, 1 lower, 1 digit.",
      );
    }
  }

  return config;
}

module.exports = {
  isStrongPassword,
  loadDashboardConfig,
};

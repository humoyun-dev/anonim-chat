const express = require("express");
const mongoose = require("mongoose");
const { isAuthenticated } = require("../middleware/auth");

/** Returns the smallest ObjectId whose embedded timestamp >= date */
function minObjId(date) {
  const hex = Math.floor(date.getTime() / 1000)
    .toString(16)
    .padStart(8, "0");
  return new mongoose.Types.ObjectId(hex + "0000000000000000");
}

function createDashboardRouter(models) {
  const router = express.Router();
  const { User, Message, SessionModel, ConversationSummary } = models;

  router.get("/dashboard", isAuthenticated, async (req, res) => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const mo = now.getMonth();
      const d = now.getDate();

      const todayStart = new Date(y, mo, d);
      const weekAgo = new Date(y, mo, d - 7);
      const twoWeeksAgo = new Date(y, mo, d - 14);
      const monthStart = new Date(y, mo, 1);
      const yearStart = new Date(y, 0, 1);

      // ── Core counts ──────────────────────────────────────────
      const [
        userCount,
        messageCount,
        sessionCount,
        todayMessages,
        weekMessages,
        monthMessages,
        yearMessages,
        totalConversations,
      ] = await Promise.all([
        User.countDocuments({}),
        Message.countDocuments({}),
        SessionModel.countDocuments({}),
        Message.countDocuments({ timestamp: { $gte: todayStart } }),
        Message.countDocuments({ timestamp: { $gte: weekAgo } }),
        Message.countDocuments({ timestamp: { $gte: monthStart } }),
        Message.countDocuments({ timestamp: { $gte: yearStart } }),
        ConversationSummary.countDocuments({}).catch(() => 0),
      ]);

      const avgMsgPerConv =
        totalConversations > 0
          ? Math.round(messageCount / totalConversations)
          : 0;

      // ── DAU / WAU / MAU (distinct active senders) ────────────
      const [dauList, wauList, mauList] = await Promise.all([
        Message.distinct("sender", { timestamp: { $gte: todayStart } }),
        Message.distinct("sender", { timestamp: { $gte: weekAgo } }),
        Message.distinct("sender", { timestamp: { $gte: monthStart } }),
      ]);
      const dau = dauList.length;
      const wau = wauList.length;
      const mau = mauList.length;

      // ── New users per period (ObjectId timestamp trick) ───────
      const [newUsersToday, newUsersWeek, newUsersMonth] = await Promise.all([
        User.countDocuments({ _id: { $gte: minObjId(todayStart) } }),
        User.countDocuments({ _id: { $gte: minObjId(weekAgo) } }),
        User.countDocuments({ _id: { $gte: minObjId(monthStart) } }),
      ]);
      const recentUsers = newUsersWeek;

      // ── Week-over-week user retention ────────────────────────
      const lastWeekList = await Message.distinct("sender", {
        timestamp: { $gte: twoWeeksAgo, $lt: weekAgo },
      });
      const wauSet = new Set(wauList.map(String));
      const retained = lastWeekList.filter((id) =>
        wauSet.has(String(id)),
      ).length;
      const retentionRate =
        lastWeekList.length > 0
          ? Math.round((retained / lastWeekList.length) * 100)
          : 0;

      // ── Avg messages per active user (weekly) ─────────────────
      const avgMsgPerUser = wau > 0 ? Math.round(weekMessages / wau) : 0;

      // ── Peak hours (last 7 days) ───────────────────────────────
      const peakHoursRaw = await Message.aggregate([
        { $match: { timestamp: { $gte: weekAgo } } },
        {
          $group: {
            _id: { $hour: "$timestamp" },
            count: { $sum: 1 },
          },
        },
      ]);
      const peakHours = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: h < 10 ? `0${h}` : `${h}`,
        count: 0,
      }));
      peakHoursRaw.forEach((item) => {
        if (item._id >= 0 && item._id < 24)
          peakHours[item._id].count = item.count;
      });

      // ── Daily chart (last 7 days) — msgs + active + new users ─
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const s = new Date(y, mo, d - i);
        const e = new Date(y, mo, d - i + 1);
        const [msgs, activeList, newU] = await Promise.all([
          Message.countDocuments({ timestamp: { $gte: s, $lt: e } }),
          Message.distinct("sender", { timestamp: { $gte: s, $lt: e } }),
          User.countDocuments({
            _id: { $gte: minObjId(s), $lt: minObjId(e) },
          }),
        ]);
        dailyStats.push({
          label: s.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          count: msgs,
          activeUsers: activeList.length,
          newUsers: newU,
        });
      }

      // ── Weekly chart (last 8 weeks) ───────────────────────────
      const weeklyStats = [];
      for (let i = 7; i >= 0; i--) {
        const s = new Date(y, mo, d - i * 7 - 6);
        const e = new Date(y, mo, d - i * 7 + 1);
        const [msgs, newU] = await Promise.all([
          Message.countDocuments({ timestamp: { $gte: s, $lt: e } }),
          User.countDocuments({
            _id: { $gte: minObjId(s), $lt: minObjId(e) },
          }),
        ]);
        const weekNum = Math.ceil(
          (s.getDate() + new Date(s.getFullYear(), s.getMonth(), 1).getDay()) /
            7,
        );
        weeklyStats.push({
          label: `W${weekNum} ${s.toLocaleDateString("en-US", { month: "short" })}`,
          count: msgs,
          newUsers: newU,
        });
      }

      // ── Monthly chart (last 12 months) ────────────────────────
      const monthlyStats = [];
      for (let i = 11; i >= 0; i--) {
        const ms = new Date(y, mo - i, 1);
        const me = new Date(y, mo - i + 1, 1);
        const [msgs, newU] = await Promise.all([
          Message.countDocuments({ timestamp: { $gte: ms, $lt: me } }),
          User.countDocuments({
            _id: { $gte: minObjId(ms), $lt: minObjId(me) },
          }),
        ]);
        monthlyStats.push({
          label: ms.toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
          }),
          count: msgs,
          newUsers: newU,
        });
      }

      // ── Yearly chart (last 4 years) ───────────────────────────
      const yearlyStats = [];
      for (let i = 3; i >= 0; i--) {
        const ys = new Date(y - i, 0, 1);
        const ye = new Date(y - i + 1, 0, 1);
        const [msgs, newU] = await Promise.all([
          Message.countDocuments({ timestamp: { $gte: ys, $lt: ye } }),
          User.countDocuments({
            _id: { $gte: minObjId(ys), $lt: minObjId(ye) },
          }),
        ]);
        yearlyStats.push({ label: String(y - i), count: msgs, newUsers: newU });
      }

      res.render("dashboard", {
        title: "Dashboard",
        active: "dashboard",
        // totals
        userCount,
        messageCount,
        sessionCount,
        totalConversations,
        avgMsgPerConv,
        // period message counts
        todayMessages,
        weekMessages,
        monthMessages,
        yearMessages,
        // active users
        dau,
        wau,
        mau,
        // new users
        newUsersToday,
        newUsersWeek,
        newUsersMonth,
        recentUsers,
        // engagement
        retentionRate,
        avgMsgPerUser,
        // charts
        peakHours,
        dailyStats,
        weeklyStats,
        monthlyStats,
        yearlyStats,
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      res.status(500).render("error", {
        title: "Error",
        active: "dashboard",
        message: "Error loading dashboard.",
      });
    }
  });

  return router;
}

module.exports = { createDashboardRouter };

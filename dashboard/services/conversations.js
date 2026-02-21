const { getRoomKey } = require("../lib/room");

function getUserDisplayName(user) {
  if (!user) return "Unknown user";
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  if (user.username) return `@${user.username}`;
  return String(user.userId);
}

async function getConversationSummaries(
  { User, Message, ConversationSummary },
  limit = 100,
) {
  let summaries = await ConversationSummary.find({})
    .sort({ lastMessageAt: -1, lastMessageId: -1 })
    .limit(limit)
    .lean()
    .exec();

  if (!summaries || summaries.length === 0) {
    const pipeline = [
      {
        $addFields: {
          userA: {
            $cond: [
              { $lt: ["$sender", "$recipient"] },
              "$sender",
              "$recipient",
            ],
          },
          userB: {
            $cond: [
              { $lt: ["$sender", "$recipient"] },
              "$recipient",
              "$sender",
            ],
          },
        },
      },
      { $sort: { timestamp: -1, _id: -1 } },
      {
        $group: {
          _id: { userA: "$userA", userB: "$userB" },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $sort: { "lastMessage.timestamp": -1, "lastMessage._id": -1 } },
      { $limit: limit },
    ];

    const conversations = await Message.aggregate(pipeline);
    summaries = conversations
      .map((c) => {
        const lastMessage = c.lastMessage || {};
        const userA = c._id.userA;
        const userB = c._id.userB;
        const preview = String(lastMessage.text || "")
          .trim()
          .slice(0, 180);
        const lastKind = lastMessage.kind || "text";
        const lastMessageText = preview || `[${lastKind}]`;
        return {
          roomKey: getRoomKey(userA, userB),
          userA,
          userB,
          lastMessageId: lastMessage._id,
          lastMessageAt: lastMessage.timestamp,
          lastMessageText,
          lastKind,
          lastSender: lastMessage.sender,
          updatedAt: new Date(),
        };
      })
      .filter((s) => s.lastMessageId && s.lastMessageAt);

    if (summaries.length) {
      const ops = summaries.map((s) => ({
        updateOne: {
          filter: { roomKey: s.roomKey },
          update: { $set: s },
          upsert: true,
        },
      }));
      ConversationSummary.bulkWrite(ops, { ordered: false }).catch((err) =>
        console.error("ConversationSummary seed error:", err),
      );
    }
  }

  const allUserIds = new Set();
  for (const c of summaries) {
    allUserIds.add(c.userA);
    allUserIds.add(c.userB);
  }

  const users = await User.find({ userId: { $in: Array.from(allUserIds) } })
    .lean()
    .exec();
  const usersById = Object.fromEntries(users.map((u) => [u.userId, u]));

  return summaries.map((c) => {
    const userA = usersById[c.userA];
    const userB = usersById[c.userB];
    return {
      userAId: c.userA,
      userBId: c.userB,
      userAName: getUserDisplayName(userA),
      userBName: getUserDisplayName(userB),
      lastTimestamp: c.lastMessageAt,
      lastPreview: c.lastMessageText || `[${c.lastKind || "media"}]`,
    };
  });
}

module.exports = { getUserDisplayName, getConversationSummaries };

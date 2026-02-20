function getRoomKey(userA, userB) {
  return [userA, userB].sort((a, b) => a - b).join("_");
}

module.exports = { getRoomKey };


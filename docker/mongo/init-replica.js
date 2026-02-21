const rsName = "rs0";
const memberHost = "mongo:27017";

function isReady() {
  try {
    const status = rs.status();
    return status && status.ok === 1;
  } catch {
    return false;
  }
}

if (!isReady()) {
  try {
    rs.initiate({
      _id: rsName,
      members: [{ _id: 0, host: memberHost }],
    });
  } catch (e) {
    // Another init process may have already initiated the replica set.
    if (!isReady()) throw e;
  }
}

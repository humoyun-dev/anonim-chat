const mongoose = require("mongoose");
const { createReplyStateModel } = require("../../shared/models/replyState");

module.exports = createReplyStateModel(mongoose);

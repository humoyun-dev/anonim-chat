const mongoose = require("mongoose");
const {
  createConversationSummaryModel,
} = require("../../shared/models/conversationSummary");

module.exports = createConversationSummaryModel(mongoose);

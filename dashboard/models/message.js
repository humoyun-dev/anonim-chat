const mongoose = require("mongoose");
const { createMessageModel } = require("../../shared/models/message");

module.exports = createMessageModel(mongoose);

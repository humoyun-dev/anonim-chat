const mongoose = require("mongoose");
const { createSessionModel } = require("../../shared/models/session");

module.exports = createSessionModel(mongoose);

const mongoose = require("mongoose");
const { createUserModel } = require("../../shared/models/user");

module.exports = createUserModel(mongoose);

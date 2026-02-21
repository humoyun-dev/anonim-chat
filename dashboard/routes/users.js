const express = require("express");
const { isAuthenticated } = require("../middleware/auth");

function createUsersRouter(models) {
  const router = express.Router();
  const { User, Message } = models;

  router.get("/users", isAuthenticated, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = 50;
      const skip = (page - 1) * limit;
      let query = {};
      if (req.query.search) {
        const regex = new RegExp(req.query.search, "i");
        query = {
          $or: [{ username: regex }, { firstName: regex }, { lastName: regex }],
        };
      }
      const [users, totalCount] = await Promise.all([
        User.find(query).sort({ userId: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(query),
      ]);
      const totalPages = Math.ceil(totalCount / limit) || 1;
      res.render("users", {
        title: "Users",
        active: "users",
        users,
        search: req.query.search || "",
        page,
        totalPages,
        totalCount,
      });
    } catch (err) {
      console.error("Users fetch error:", err);
      res.status(500).render("error", {
        title: "Error",
        active: "users",
        message: "Error retrieving users.",
      });
    }
  });

  router.post("/user/:userId/delete", isAuthenticated, async (req, res) => {
    try {
      await User.deleteOne({ userId: parseInt(req.params.userId, 10) });
      res.redirect("/users?flash=user_deleted");
    } catch (err) {
      console.error("User delete error:", err);
      res.redirect("/users?flash=error");
    }
  });

  router.get("/user/:userId/detail", isAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    try {
      const sentPartners = await Message.distinct("recipient", {
        sender: userId,
      });
      const receivedPartners = await Message.distinct("sender", {
        recipient: userId,
      });
      const partnerIds = [...new Set([...sentPartners, ...receivedPartners])];
      const partners = await User.find({ userId: { $in: partnerIds } });
      res.render("userDetail", {
        title: "User Detail",
        active: "users",
        userId,
        partners,
      });
    } catch (err) {
      console.error("Error fetching user detail:", err);
      res.send("Failed to load user details.");
    }
  });

  return router;
}

module.exports = { createUsersRouter };

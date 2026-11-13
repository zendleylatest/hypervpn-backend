const express = require("express");
const {
  verifyAdminOrServiceKey,
} = require("../middlewares/adminAuthMiddleware");
const {
  getUsers,
  updateUserStatus,
  updateUserUsageLimit,
  getUserUsageLimit,
  getAllUsersVPNUsage,
  getSpecificUserUsage,
} = require("../controllers/adminController");

const router = express.Router();

router.get("/users", verifyAdminOrServiceKey, getUsers);
router.patch("/users/:userId/status", verifyAdminOrServiceKey, updateUserStatus);
router.post(
  "/users/:userId/usage-limit",
  verifyAdminOrServiceKey,
  updateUserUsageLimit
);
router.get(
  "/users/:userId/usage-limit",
  verifyAdminOrServiceKey,
  getUserUsageLimit
);
router.put(
  "/users/:userId/usage-limit",
  verifyAdminOrServiceKey,
  updateUserUsageLimit
);
router.patch(
  "/users/:userId/usage-limit",
  verifyAdminOrServiceKey,
  updateUserUsageLimit
);
router.get("/vpn-usage", verifyAdminOrServiceKey, getAllUsersVPNUsage);
router.get("/vpn-usage/:userId", verifyAdminOrServiceKey, getSpecificUserUsage);

module.exports = router;

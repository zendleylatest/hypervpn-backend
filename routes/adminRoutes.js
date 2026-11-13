const express = require("express");
const {
  verifyAdmin,
  verifyAdminOrServiceKey,
} = require("../middlewares/adminAuthMiddleware");
const {
  getUsers,
  updateUser,
  setUserBanState,
  updateUserStatus,
  updateUserUsageLimit,
  getUserUsageLimit,
  toggleUserActive,
  getUsageOverview,
  getAllUsersVPNUsage,
  getSpecificUserUsage,
  broadcastNotification,
} = require("../controllers/adminController");

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Admin routes are working" });
});

// AllAppsAdmin uses X-Service-Key; existing dashboard JWTs remain supported.
router.get("/users", verifyAdminOrServiceKey, getUsers);
router.patch("/users/:id/ban", verifyAdminOrServiceKey, setUserBanState);
router.patch("/users/:userId/status", verifyAdmin, updateUserStatus);
router.post("/users/:userId/usage-limit", verifyAdmin, updateUserUsageLimit);
router.get("/users/:userId/usage-limit", verifyAdmin, getUserUsageLimit);
router.put("/users/:userId/usage-limit", verifyAdmin, updateUserUsageLimit);
router.patch("/users/:userId/usage-limit", verifyAdmin, updateUserUsageLimit);
router.patch("/users/:id/toggle", verifyAdminOrServiceKey, toggleUserActive);
router.get("/usage", verifyAdminOrServiceKey, getUsageOverview);
router.get("/vpn-usage", verifyAdmin, getAllUsersVPNUsage);
router.get("/vpn-usage/:userId", verifyAdmin, getSpecificUserUsage);

router.put("/users/:id", verifyAdmin, updateUser);
router.post("/notifications/broadcast", verifyAdmin, broadcastNotification);

module.exports = router;

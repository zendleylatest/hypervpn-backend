const express = require("express");
const {
  listServers,
  getOptimalServer,
  getVpnConfig,
  getPlans,
  getEntitlement,
  verifyIap,
  clearPremiumAfterRestore,
  getServerProfile,
  connect,
  disconnect,
  getSession,
  reportUsage,
} = require("../controllers/vpnController");
const { authenticate, optionalAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/config", getVpnConfig);
router.get("/servers", listServers);
router.get("/servers/optimal", getOptimalServer);
router.get("/servers/:serverId/profile", optionalAuth, getServerProfile);
router.get("/plans", getPlans);
router.get("/entitlement", authenticate, getEntitlement);
router.post("/iap/verify", authenticate, verifyIap);
router.post("/iap/restore-clear", authenticate, clearPremiumAfterRestore);
router.post("/connect", authenticate, connect);
router.post("/disconnect", authenticate, disconnect);
router.get("/sessions/:sessionId", authenticate, getSession);
router.post("/sessions/:sessionId/usage", authenticate, reportUsage);

module.exports = router;

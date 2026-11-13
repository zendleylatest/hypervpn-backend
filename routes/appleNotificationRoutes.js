const express = require("express");
const { handleAppleNotification } = require("../controllers/appleNotificationController");

const router = express.Router();

// Configure this URL in App Store Connect > App Information >
// App Store Server Notifications (production and sandbox).
router.post("/", handleAppleNotification);

module.exports = router;

const mongoose = require("mongoose");

/**
 * Standalone FCM tokens. Optional [userId] is stored as a string so User
 * documents do not need embedded device token arrays.
 */
const pushDeviceTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    userId: {
      type: String,
      default: null,
      trim: true,
    },
    deviceType: { type: String, default: "unknown", trim: true },
    deviceInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushDeviceToken", pushDeviceTokenSchema);

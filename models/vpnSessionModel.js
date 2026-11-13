const mongoose = require("mongoose");

const vpnSessionSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    serverId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    serverName: {
      type: String,
      required: true,
      trim: true,
    },
    protocol: {
      type: String,
      enum: ["wireguard", "openvpn"],
      default: "wireguard",
    },
    status: {
      type: String,
      enum: ["connected", "disconnected", "limit_reached"],
      default: "connected",
      index: true,
    },
    usageBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    virtualIp: {
      type: String,
      default: "",
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    disconnectedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

vpnSessionSchema.index({ deviceId: 1, status: 1, updatedAt: -1 });
vpnSessionSchema.index({ userId: 1, status: 1, updatedAt: -1 });

module.exports =
  mongoose.models.VpnSession ||
  mongoose.model("VpnSession", vpnSessionSchema);

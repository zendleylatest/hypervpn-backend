const mongoose = require("mongoose");
const { storedAccountFieldsForUser } = require("../utils/vpnQuota");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      unique: true,
    },
    profession: {
      type: String,
    },
    password: {
      type: String,
    },
    image: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    otp: {
      type: String,
    },
    emailVerified: {
      type: Boolean,
    },
    googleId: {
      type: String,
    },
    appleId: {
      type: String,
      index: true,
      sparse: true,
    },
    // Used only to revoke the Sign in with Apple grant when the account is
    // deleted. Never returned by queries unless asked for explicitly.
    appleRefreshToken: {
      type: String,
      select: false,
    },
    isGuest: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPro: {
      type: Boolean,
      default: false,
      index: true,
    },
    subscription: {
      plan: {
        type: String,
        enum: ["guest", "free", "pro"],
        default: "free",
        index: true,
      },
      status: {
        type: String,
        enum: [
          "inactive",
          "active",
          "canceled",
          "expired",
          "verify_failed",
          "unsupported",
        ],
        default: "inactive",
        index: true,
      },
      provider: {
        type: String,
        enum: ["none", "manual", "google", "apple", "stripe"],
        default: "none",
      },
      productId: {
        type: String,
        default: "",
        trim: true,
      },
      purchaseToken: {
        type: String,
        default: "",
        trim: true,
      },
      platform: {
        type: String,
        enum: ["none", "android", "ios", "web"],
        default: "none",
      },
      source: {
        type: String,
        default: "none",
        trim: true,
      },
      originalTransactionId: {
        type: String,
        default: "",
        trim: true,
      },
      manualGrant: {
        type: Boolean,
        default: false,
        index: true,
      },
      grantedBy: {
        type: String,
        default: "",
        trim: true,
      },
      grantedAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      lastVerifiedAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    vpnUsageBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    vpnAccountType: {
      type: String,
      enum: ["guest", "free", "pro"],
      default: "free",
      index: true,
    },
    vpnLimitBytes: {
      type: Number,
      default: 10 * 1024 * 1024 * 1024,
      min: 0,
    },
    vpnLimitLabel: {
      type: String,
      default: "10 GB",
      trim: true,
    },
    vpnUsageResetAt: {
      type: Date,
      default: null,
    },
    guestDeviceId: {
      type: String,
      trim: true,
      index: true,
    },
    resetOTP: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    usageLimit: {
      type: Number,
      default: 1024,
      min: 0,
    },
    bannedAt: {
      type: Date,
      default: null,
    },
    bannedReason: {
      type: String,
      default: "",
      trim: true,
    },
    openAiUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      requestCount: { type: Number, default: 0 },
      lastUsedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function syncAccountFields() {
  const fields = storedAccountFieldsForUser(this);
  this.subscription = fields.subscription;
  this.vpnAccountType = fields.vpnAccountType;
  this.vpnLimitBytes = fields.vpnLimitBytes;
  this.vpnLimitLabel = fields.vpnLimitLabel;
});

const User = mongoose.model("User", userSchema);

module.exports = User;

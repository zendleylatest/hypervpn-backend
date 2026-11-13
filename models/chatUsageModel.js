const mongoose = require("mongoose");

const chatUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    requestType: {
      type: String,
      enum: ["guest", "authenticated"],
      default: "authenticated",
    },
    feature: {
      type: String,
      enum: ["business-idea", "faq-chat"],
      default: "business-idea",
    },
    model: {
      type: String,
      default: "",
    },
    usage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ChatUsage ||
  mongoose.model("ChatUsage", chatUsageSchema);
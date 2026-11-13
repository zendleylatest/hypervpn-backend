const mongoose = require("mongoose");

const savedIdeaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    promptId: {
      type: String,
      required: true,
      trim: true,
    },
    title: { type: String, trim: true, default: "Business Idea" },
    preview: { type: String, trim: true, default: "" },
    body: { type: String, trim: true, default: "" },
    tags: [{ type: String, trim: true }],
    generationType: {
      type: String,
      enum: ["first", "regenerated"],
      default: "first",
    },
    generationLabel: {
      type: String,
      trim: true,
      default: "First idea",
    },
  },
  { timestamps: true }
);

savedIdeaSchema.index({ userId: 1, promptId: 1 }, { unique: true });

module.exports = mongoose.model("SavedIdea", savedIdeaSchema);

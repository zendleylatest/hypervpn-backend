import mongoose from 'mongoose';

/**
 * Knowledge entry schema — stores learned facts that the AI chatbot
 * can reference. Mirrors the rebstockbot JSON knowledge store but uses
 * MongoDB for persistence, querying, and scalability.
 */
const knowledgeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: null,
    },
    content: {
      type: String,
      required: [true, 'Knowledge content is required'],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    // Who added this entry (admin user ID, or "api" for API-key based adds)
    addedBy: {
      type: String,
      default: 'api',
    },
    // Soft-delete flag — entries can be disabled without removal
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // auto createdAt + updatedAt
  }
);

// Full-text index for search across title, content, category, and tags
knowledgeSchema.index({ title: 'text', content: 'text', category: 'text' });

// Index for filtering by category or active status
knowledgeSchema.index({ category: 1, active: 1 });
knowledgeSchema.index({ active: 1, createdAt: -1 });

const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

export default Knowledge;

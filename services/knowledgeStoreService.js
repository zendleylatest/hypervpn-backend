/**
 * Knowledge Store Service
 *
 * Provides CRUD + search operations for the AI learning knowledge base.
 * Ported from rebstockbot's file-based knowledgeStore.js to use MongoDB
 * via Mongoose, making it production-ready for the main backend.
 *
 * The service also exposes helpers to format knowledge entries into
 * prompt-ready text blocks for RAG / system-prompt injection.
 */

import Knowledge from '../models/Knowledge.js';

// ─── Formatting helpers ────────────────────────────────────────────

/**
 * Format a single knowledge entry into a prompt-friendly text block.
 * Matches the rebstockbot style: TITLE (uppercase), (Category), content.
 */
export function formatEntryBlock(entry) {
  const title = entry.title?.trim();
  const content = entry.content?.trim();
  if (!content) return '';
  const header = title ? `${title.toUpperCase()}\n` : '';
  const category = entry.category?.trim();
  const meta = category ? `(Category: ${category})\n` : '';
  return `${header}${meta}${content}`;
}

/**
 * Format an array of entries into a single knowledge text blob.
 */
export function formatLearnedKnowledge(entries) {
  return entries.map(formatEntryBlock).filter(Boolean).join('\n\n');
}

// ─── CRUD operations ───────────────────────────────────────────────

/**
 * List all knowledge entries, optionally filtered.
 * @param {{ category?: string, active?: boolean, search?: string, limit?: number, skip?: number }} opts
 */
export async function listKnowledgeEntries(opts = {}) {
  const filter = {};

  // Default to only active entries unless explicitly requested
  if (opts.active !== undefined) {
    filter.active = opts.active;
  } else {
    filter.active = true;
  }

  if (opts.category) {
    filter.category = opts.category;
  }

  if (opts.search) {
    filter.$text = { $search: opts.search };
  }

  const query = Knowledge.find(filter).sort({ createdAt: -1 });

  if (opts.limit) query.limit(opts.limit);
  if (opts.skip) query.skip(opts.skip);

  return query.lean();
}

/**
 * Count knowledge entries matching a filter.
 */
export async function countKnowledgeEntries(opts = {}) {
  const filter = {};
  if (opts.active !== undefined) filter.active = opts.active;
  else filter.active = true;
  if (opts.category) filter.category = opts.category;
  if (opts.search) filter.$text = { $search: opts.search };
  return Knowledge.countDocuments(filter);
}

/**
 * Get a single knowledge entry by its Mongo _id.
 */
export async function getKnowledgeEntry(id) {
  return Knowledge.findById(id).lean();
}

/**
 * Add a single knowledge entry.
 * @param {{ title?: string, content: string, category?: string, tags?: string[], addedBy?: string }} input
 */
export async function addKnowledgeEntry(input) {
  const content = input?.content?.trim();
  if (!content) throw new Error('content is required');

  const entry = await Knowledge.create({
    title: input.title?.trim() || null,
    content,
    category: input.category?.trim() || null,
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    addedBy: input.addedBy || 'api',
  });

  return entry.toObject();
}

/**
 * Add multiple knowledge entries in bulk.
 * @param {Array<{ title?: string, content: string, category?: string, tags?: string[] }>} entries
 * @param {string} [addedBy='api']
 */
export async function addKnowledgeEntriesBulk(entries, addedBy = 'api') {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('entries array is required');
  }

  const docs = entries
    .filter((item) => item?.content?.trim())
    .map((item) => ({
      title: item.title?.trim() || null,
      content: item.content.trim(),
      category: item.category?.trim() || null,
      tags: Array.isArray(item.tags)
        ? item.tags.map((t) => String(t).trim()).filter(Boolean)
        : [],
      addedBy,
    }));

  if (docs.length === 0) {
    throw new Error('no valid entries (each needs content)');
  }

  const created = await Knowledge.insertMany(docs);
  return created.map((d) => d.toObject());
}

/**
 * Update a knowledge entry by _id.
 * @param {string} id
 * @param {{ title?: string, content?: string, category?: string, tags?: string[], active?: boolean }} patch
 */
export async function updateKnowledgeEntry(id, patch) {
  const update = {};

  if (patch.title !== undefined) update.title = patch.title?.trim() || null;
  if (patch.content !== undefined) {
    const content = patch.content?.trim();
    if (!content) throw new Error('content cannot be empty');
    update.content = content;
  }
  if (patch.category !== undefined) update.category = patch.category?.trim() || null;
  if (patch.tags !== undefined) {
    update.tags = Array.isArray(patch.tags)
      ? patch.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
  }
  if (patch.active !== undefined) update.active = Boolean(patch.active);

  const entry = await Knowledge.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();

  return entry;
}

/**
 * Delete a knowledge entry by _id (hard delete).
 */
export async function deleteKnowledgeEntry(id) {
  const result = await Knowledge.findByIdAndDelete(id);
  return !!result;
}

/**
 * Soft-delete: mark entry as inactive.
 */
export async function deactivateKnowledgeEntry(id) {
  const entry = await Knowledge.findByIdAndUpdate(
    id,
    { active: false },
    { new: true }
  ).lean();
  return entry;
}

/**
 * Restore a soft-deleted entry.
 */
export async function reactivateKnowledgeEntry(id) {
  const entry = await Knowledge.findByIdAndUpdate(
    id,
    { active: true },
    { new: true }
  ).lean();
  return entry;
}

// ─── RAG / Prompt helpers ──────────────────────────────────────────

/**
 * Get all active knowledge as a single formatted text string
 * ready to inject into an AI system prompt.
 */
export async function getMergedKnowledgeText() {
  const entries = await Knowledge.find({ active: true })
    .sort({ createdAt: 1 })
    .lean();

  const learned = formatLearnedKnowledge(entries);
  if (!learned) return '';
  return `\n\n--- LEARNED KNOWLEDGE ---\n\n${learned}\n`;
}

/**
 * Get distinct categories for filtering UI.
 */
export async function getKnowledgeCategories() {
  return Knowledge.distinct('category', { active: true, category: { $ne: null } });
}

/**
 * Get knowledge stats for admin dashboard.
 */
export async function getKnowledgeStats() {
  const [total, active, inactive, categories] = await Promise.all([
    Knowledge.countDocuments(),
    Knowledge.countDocuments({ active: true }),
    Knowledge.countDocuments({ active: false }),
    Knowledge.distinct('category', { active: true, category: { $ne: null } }),
  ]);

  return { total, active, inactive, categories: categories.length, categoryList: categories };
}

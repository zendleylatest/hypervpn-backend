/**
 * Knowledge Controller
 *
 * Handles all HTTP operations for the AI learning knowledge base.
 * Ported from rebstockbot's routes/knowledge.js into the backend's
 * controller pattern (route → controller → service → model).
 */

import {
  listKnowledgeEntries,
  countKnowledgeEntries,
  getKnowledgeEntry,
  addKnowledgeEntry,
  addKnowledgeEntriesBulk,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  deactivateKnowledgeEntry,
  reactivateKnowledgeEntry,
  getMergedKnowledgeText,
  getKnowledgeCategories,
  getKnowledgeStats,
} from '../services/knowledgeStoreService.js';

// ─── READ (no auth required) ──────────────────────────────────────

/**
 * GET /api/knowledge
 * List all knowledge entries with optional filtering and pagination.
 *
 * Query params:
 *   category  — filter by category
 *   search    — full-text search across title/content/category
 *   active    — "true" | "false" | "all"  (default: true)
 *   limit     — page size (default: 50)
 *   skip      — offset for pagination
 */
export async function listEntries(req, res) {
  try {
    const { category, search, active, limit = 50, skip = 0 } = req.query;

    const opts = {
      category: category || undefined,
      search: search || undefined,
      limit: Math.min(Number(limit) || 50, 200),
      skip: Number(skip) || 0,
    };

    // Parse active filter
    if (active === 'all') {
      opts.active = undefined; // no filter
    } else if (active === 'false') {
      opts.active = false;
    } else {
      opts.active = true; // default
    }

    const [entries, total] = await Promise.all([
      listKnowledgeEntries(opts),
      countKnowledgeEntries(opts),
    ]);

    res.json({
      success: true,
      count: entries.length,
      total,
      entries,
    });
  } catch (err) {
    console.error('GET /api/knowledge:', err?.message || err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to list knowledge entries',
    });
  }
}

/**
 * GET /api/knowledge/stats
 * Admin dashboard stats.
 */
export async function stats(req, res) {
  try {
    const data = await getKnowledgeStats();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Stats failed' });
  }
}

/**
 * GET /api/knowledge/categories
 * Distinct active categories for filter dropdowns.
 */
export async function categories(req, res) {
  try {
    const cats = await getKnowledgeCategories();
    res.json({ success: true, categories: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Categories failed' });
  }
}

/**
 * GET /api/knowledge/merged
 * Full merged knowledge text (used by chatbot to inject into prompts).
 */
export async function merged(req, res) {
  try {
    const text = await getMergedKnowledgeText();
    res.json({
      success: true,
      totalCharacters: text.length,
      text,
      note: 'This is the combined learned knowledge for AI prompt injection.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Merge failed' });
  }
}

/**
 * GET /api/knowledge/:id
 * Get a single entry by ID.
 */
export async function getEntry(req, res) {
  try {
    const entry = await getKnowledgeEntry(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to get entry' });
  }
}

// ─── WRITE (auth required) ────────────────────────────────────────

/**
 * POST /api/knowledge
 *
 * Body (single):
 *   { "title": "Spa hours", "content": "Open 8am–10pm daily.", "category": "facilities", "tags": ["spa"] }
 *
 * Body (bulk):
 *   { "entries": [ { "title": "...", "content": "..." }, ... ] }
 */
export async function createEntry(req, res) {
  try {
    // Bulk mode
    if (Array.isArray(req.body?.entries)) {
      const addedBy = req.adminId || req.knowledgeAuthMethod || 'api';
      const created = await addKnowledgeEntriesBulk(req.body.entries, addedBy);
      return res.status(201).json({
        success: true,
        created: created.length,
        entries: created,
        message: `${created.length} knowledge entries added successfully.`,
      });
    }

    // Single entry
    const content = req.body?.content;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Provide "content" (string) or "entries" (array of { title?, content }).',
      });
    }

    const entry = await addKnowledgeEntry({
      title: req.body.title,
      content,
      category: req.body.category,
      tags: req.body.tags,
      addedBy: req.adminId || req.knowledgeAuthMethod || 'api',
    });

    res.status(201).json({
      success: true,
      entry,
      message: 'Knowledge entry added successfully.',
    });
  } catch (err) {
    console.error('POST /api/knowledge:', err?.message || err);
    res.status(400).json({
      success: false,
      message: err?.message || 'Failed to add knowledge',
    });
  }
}

/**
 * PUT /api/knowledge/:id
 */
export async function updateEntry(req, res) {
  try {
    const entry = await updateKnowledgeEntry(req.params.id, {
      title: req.body?.title,
      content: req.body?.content,
      category: req.body?.category,
      tags: req.body?.tags,
      active: req.body?.active,
    });

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    res.json({ success: true, entry, message: 'Knowledge entry updated.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to update' });
  }
}

/**
 * PATCH /api/knowledge/:id/deactivate
 * Soft-delete an entry.
 */
export async function deactivateEntry(req, res) {
  try {
    const entry = await deactivateKnowledgeEntry(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    res.json({ success: true, entry, message: 'Entry deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to deactivate' });
  }
}

/**
 * PATCH /api/knowledge/:id/reactivate
 * Restore a soft-deleted entry.
 */
export async function reactivateEntry(req, res) {
  try {
    const entry = await reactivateKnowledgeEntry(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    res.json({ success: true, entry, message: 'Entry reactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to reactivate' });
  }
}

/**
 * DELETE /api/knowledge/:id
 * Hard-delete an entry.
 */
export async function removeEntry(req, res) {
  try {
    const removed = await deleteKnowledgeEntry(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    res.json({ success: true, deleted: req.params.id, message: 'Entry permanently deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to delete' });
  }
}

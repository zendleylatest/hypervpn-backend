/**
 * Knowledge Routes
 *
 * /api/knowledge — AI Learning Knowledge Base
 *
 * GET routes are public (no auth) so the chatbot and admin dashboard
 * can read entries freely. Write routes (POST, PUT, PATCH, DELETE)
 * require either an admin JWT token or a dedicated KNOWLEDGE_API_KEY.
 */

import express from 'express';
import { requireKnowledgeAuth } from '../middleware/knowledgeAuth.js';
import {
  listEntries,
  stats,
  categories,
  merged,
  getEntry,
  createEntry,
  updateEntry,
  deactivateEntry,
  reactivateEntry,
  removeEntry,
} from '../controllers/knowledgeController.js';

const router = express.Router();

// ─── READ routes (no auth) ─────────────────────────────────────────

// GET /api/knowledge                — list entries (with filters & pagination)
router.get('/', listEntries);

// GET /api/knowledge/stats          — dashboard stats (total, active, inactive, categories)
router.get('/stats', stats);

// GET /api/knowledge/categories     — distinct categories for filter UI
router.get('/categories', categories);

// GET /api/knowledge/merged         — full merged knowledge text for AI prompt injection
router.get('/merged', merged);

// GET /api/knowledge/:id            — single entry by ID
router.get('/:id', getEntry);

// ─── WRITE routes (auth required) ──────────────────────────────────

// POST /api/knowledge               — add single entry or bulk { entries: [...] }
router.post('/', requireKnowledgeAuth, createEntry);

// PUT /api/knowledge/:id            — update an entry
router.put('/:id', requireKnowledgeAuth, updateEntry);

// PATCH /api/knowledge/:id/deactivate — soft-delete
router.patch('/:id/deactivate', requireKnowledgeAuth, deactivateEntry);

// PATCH /api/knowledge/:id/reactivate — restore soft-deleted
router.patch('/:id/reactivate', requireKnowledgeAuth, reactivateEntry);

// DELETE /api/knowledge/:id         — hard delete
router.delete('/:id', requireKnowledgeAuth, removeEntry);

export default router;

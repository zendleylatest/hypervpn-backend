import express from 'express';
import { faqChat } from '../controllers/faqController.js';

const router = express.Router();

// POST /api/faq/chat — public, no auth required
router.post('/chat', faqChat);

export default router;

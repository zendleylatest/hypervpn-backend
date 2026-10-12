import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as exportController from '../controllers/exportController.js';

const router = express.Router();

// Export user data as PDF
router.get('/data', authenticate, exportController.exportUserData);

export default router;

import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as progressController from '../controllers/progressController.js';

const router = express.Router();

// Log weight entry
router.post('/weight', authenticate, [
  body('weight').isNumeric().withMessage('Weight must be numeric'),
  body('date').isISO8601().optional(),
  body('notes').trim().optional()
], progressController.logWeight);

// Get weight progress
router.get('/weight', authenticate, progressController.getWeightProgress);

// Get progress dashboard (calorie adherence, macro balance, symptom frequency)
router.get('/dashboard', authenticate, progressController.getProgressDashboard);

// Delete progress log
router.delete('/weight/:id', authenticate, progressController.deleteProgressLog);

export default router;

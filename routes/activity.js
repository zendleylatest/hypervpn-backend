import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as activityController from '../controllers/activityController.js';

const router = express.Router();

// Log an activity entry
router.post('/log', authenticate, [
  body('activityType').isIn(['Walking', 'Running', 'Cycling', 'Swimming', 'Gym', 'Yoga', 'Other']).withMessage('Invalid activity type'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be at least 1 minute'),
  body('caloriesBurned').isNumeric().withMessage('Calories burned must be numeric'),
  body('notes').trim().optional(),
  body('date').isISO8601().optional()
], activityController.logActivity);

// Get activity logs
router.get('/logs', authenticate, activityController.getActivityLogs);

// Get daily activity summary
router.get('/daily-summary', authenticate, activityController.getDailyActivitySummary);

// Delete activity log
router.delete('/:id', authenticate, activityController.deleteActivityLog);

export default router;

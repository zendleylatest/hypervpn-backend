import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as symptomController from '../controllers/symptomController.js';

const router = express.Router();

// Log a symptom entry
router.post('/log', authenticate, [
  body('symptomType').isIn(['Fatigue', 'Bloating', 'Nausea', 'Pain Level', 'Energy']),
  body('rating').isInt({ min: 1, max: 5 }),
  body('notes').trim().optional(),
  body('date').isISO8601().optional()
], symptomController.logSymptom);

// Get symptom logs
router.get('/logs', authenticate, symptomController.getSymptomLogs);

// Get symptom trends (for charts)
router.get('/trends', authenticate, symptomController.getSymptomTrends);

// Get recent logs for a specific symptom
router.get('/recent', authenticate, symptomController.getRecentSymptoms);

// Delete a symptom log
router.delete('/:id', authenticate, symptomController.deleteSymptomLog);

export default router;

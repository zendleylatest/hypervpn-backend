import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as foodController from '../controllers/foodController.js';

const router = express.Router();

// Log a food entry
router.post('/log', authenticate, [
  body('foodName').trim().notEmpty().withMessage('Food name is required'),
  body('portionSize.amount').isNumeric().withMessage('Portion amount must be numeric'),
  body('portionSize.unit').isIn(['g', 'ml', 'cup', 'piece', 'serving']).withMessage('Invalid unit'),
  body('calories').isNumeric().withMessage('Calories must be numeric'),
  body('macros.carbs').isNumeric().optional(),
  body('macros.protein').isNumeric().optional(),
  body('macros.fat').isNumeric().optional(),
  body('macros.fibre').isNumeric().optional(),
  body('mealType').isIn(['Breakfast', 'Lunch', 'Dinner', 'Snack']).optional(),
  body('date').isISO8601().optional()
], foodController.logFood);

// Get food logs
router.get('/logs', authenticate, foodController.getFoodLogs);

// Get daily food summary
router.get('/daily-summary', authenticate, foodController.getDailyFoodSummary);

// Delete food log
router.delete('/:id', authenticate, foodController.deleteFoodLog);

export default router;

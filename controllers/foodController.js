import FoodLog from '../models/FoodLog.js';
import { validationResult } from 'express-validator';

/**
 * Log a food entry
 */
export const logFood = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { foodName, portionSize, calories, macros, barcode, mealType, date } = req.body;

    const foodLog = new FoodLog({
      userId: req.userId,
      foodName,
      portionSize: {
        amount: portionSize.amount,
        unit: portionSize.unit
      },
      calories,
      macros: macros || {},
      barcode,
      mealType: mealType || 'Snack',
      date: date ? new Date(date) : new Date(),
      timestamp: new Date()
    });

    await foodLog.save();

    res.status(201).json({
      success: true,
      message: 'Food logged successfully',
      foodLog
    });
  } catch (error) {
    console.error('[logFood] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log food',
      error: error.message
    });
  }
};

/**
 * Get food logs
 */
export const getFoodLogs = async (req, res) => {
  try {
    const { startDate, endDate, mealType, limit = 100 } = req.query;
    
    const query = { userId: req.userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    if (mealType) {
      query.mealType = mealType;
    }

    const logs = await FoodLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('[getFoodLogs] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get food logs',
      error: error.message
    });
  }
};

/**
 * Get daily food summary (for macro ring)
 */
export const getDailyFoodSummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const logs = await FoodLog.find({
      userId: req.userId,
      date: { $gte: targetDate, $lt: nextDate }
    });

    const summary = logs.reduce((acc, log) => {
      acc.totalCalories += log.calories || 0;
      acc.totalCarbs += log.macros?.carbs || 0;
      acc.totalProtein += log.macros?.protein || 0;
      acc.totalFat += log.macros?.fat || 0;
      acc.totalFibre += log.macros?.fibre || 0;
      return acc;
    }, {
      totalCalories: 0,
      totalCarbs: 0,
      totalProtein: 0,
      totalFat: 0,
      totalFibre: 0
    });

    res.json({
      success: true,
      date: targetDate.toISOString(),
      summary
    });
  } catch (error) {
    console.error('[getDailyFoodSummary] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily food summary',
      error: error.message
    });
  }
};

/**
 * Delete food log
 */
export const deleteFoodLog = async (req, res) => {
  try {
    const log = await FoodLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Food log not found'
      });
    }

    res.json({
      success: true,
      message: 'Food log deleted successfully'
    });
  } catch (error) {
    console.error('[deleteFoodLog] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete food log',
      error: error.message
    });
  }
};

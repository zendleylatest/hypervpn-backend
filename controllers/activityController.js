import ActivityLog from '../models/ActivityLog.js';
import { validationResult } from 'express-validator';

/**
 * Log an activity entry
 */
export const logActivity = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { activityType, duration, caloriesBurned, notes, date } = req.body;

    const activityLog = new ActivityLog({
      userId: req.userId,
      activityType,
      duration,
      caloriesBurned,
      notes,
      date: date ? new Date(date) : new Date(),
      timestamp: new Date()
    });

    await activityLog.save();

    res.status(201).json({
      success: true,
      message: 'Activity logged successfully',
      activityLog
    });
  } catch (error) {
    console.error('[logActivity] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log activity',
      error: error.message
    });
  }
};

/**
 * Get activity logs
 */
export const getActivityLogs = async (req, res) => {
  try {
    const { startDate, endDate, activityType, limit = 100 } = req.query;
    
    const query = { userId: req.userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    if (activityType) {
      query.activityType = activityType;
    }

    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('[getActivityLogs] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs',
      error: error.message
    });
  }
};

/**
 * Get daily activity summary (calories burned)
 */
export const getDailyActivitySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const logs = await ActivityLog.find({
      userId: req.userId,
      date: { $gte: targetDate, $lt: nextDate }
    });

    const totalCaloriesBurned = logs.reduce((sum, log) => sum + (log.caloriesBurned || 0), 0);
    const totalDuration = logs.reduce((sum, log) => sum + (log.duration || 0), 0);

    res.json({
      success: true,
      date: targetDate.toISOString(),
      totalCaloriesBurned,
      totalDuration,
      activities: logs.length
    });
  } catch (error) {
    console.error('[getDailyActivitySummary] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily activity summary',
      error: error.message
    });
  }
};

/**
 * Delete activity log
 */
export const deleteActivityLog = async (req, res) => {
  try {
    const log = await ActivityLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Activity log not found'
      });
    }

    res.json({
      success: true,
      message: 'Activity log deleted successfully'
    });
  } catch (error) {
    console.error('[deleteActivityLog] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity log',
      error: error.message
    });
  }
};

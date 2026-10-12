import SymptomLog from '../models/SymptomLog.js';
import { validationResult } from 'express-validator';

/**
 * Log a symptom entry
 */
export const logSymptom = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { symptomType, rating, notes, date } = req.body;

    const symptomLog = new SymptomLog({
      userId: req.userId,
      symptomType,
      rating,
      notes,
      date: date ? new Date(date) : new Date()
    });

    await symptomLog.save();

    res.status(201).json({
      success: true,
      message: 'Symptom logged successfully',
      symptomLog
    });
  } catch (error) {
    console.error('Log symptom error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log symptom',
      error: error.message
    });
  }
};

/**
 * Get symptom logs
 */
export const getSymptomLogs = async (req, res) => {
  try {
    const { symptomType, startDate, endDate, limit = 50 } = req.query;
    
    const query = { userId: req.userId };
    
    if (symptomType) {
      query.symptomType = symptomType;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const logs = await SymptomLog.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Get symptom logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get symptom logs',
      error: error.message
    });
  }
};

/**
 * Get symptom trends
 */
export const getSymptomTrends = async (req, res) => {
  try {
    const { symptomType, days = 7 } = req.query;
    
    if (!symptomType) {
      return res.status(400).json({
        success: false,
        message: 'symptomType is required'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    const logs = await SymptomLog.find({
      userId: req.userId,
      symptomType,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    // Group by date and calculate average if multiple entries per day
    const trends = [];
    const dateMap = {};

    logs.forEach(log => {
      const dateKey = log.date.toISOString().split('T')[0];
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { date: dateKey, ratings: [] };
      }
      dateMap[dateKey].ratings.push(log.rating);
    });

    Object.keys(dateMap).sort().forEach(dateKey => {
      const ratings = dateMap[dateKey].ratings;
      const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      trends.push({
        date: dateKey,
        rating: Math.round(average * 10) / 10,
        count: ratings.length
      });
    });

    res.json({
      success: true,
      symptomType,
      days: parseInt(days),
      trends
    });
  } catch (error) {
    console.error('Get symptom trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get symptom trends',
      error: error.message
    });
  }
};

/**
 * Get recent symptom logs
 */
export const getRecentSymptoms = async (req, res) => {
  try {
    const { symptomType, limit = 5 } = req.query;
    
    if (!symptomType) {
      return res.status(400).json({
        success: false,
        message: 'symptomType is required'
      });
    }

    const logs = await SymptomLog.find({
      userId: req.userId,
      symptomType
    })
      .sort({ date: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Get recent symptoms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent symptoms',
      error: error.message
    });
  }
};

/**
 * Delete symptom log
 */
export const deleteSymptomLog = async (req, res) => {
  try {
    const log = await SymptomLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Symptom log not found'
      });
    }

    res.json({
      success: true,
      message: 'Symptom log deleted successfully'
    });
  } catch (error) {
    console.error('Delete symptom log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete symptom log',
      error: error.message
    });
  }
};

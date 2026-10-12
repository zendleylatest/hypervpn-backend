import Reminder from '../models/Reminder.js';
import { validationResult } from 'express-validator';

/**
 * Create reminder (stored per authenticated user).
 * Delivery at [time] is via FCM push (see reminderPushScheduler) using [timezone].
 */
export const createReminder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { title, type, time, enabled = true, daysOfWeek, frequency = 'daily', medication, timezone } = req.body;

    // Calculate daysOfWeek based on frequency if not provided
    let calculatedDaysOfWeek = daysOfWeek;
    if (!calculatedDaysOfWeek) {
      switch (frequency) {
        case 'daily':
          calculatedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
          break;
        case 'weekdays':
          calculatedDaysOfWeek = [1, 2, 3, 4, 5]; // Monday to Friday
          break;
        case 'weekends':
          calculatedDaysOfWeek = [0, 6]; // Sunday and Saturday
          break;
        case 'weekly':
          calculatedDaysOfWeek = [new Date().getDay()]; // Current day
          break;
        case 'custom':
          calculatedDaysOfWeek = daysOfWeek || [];
          break;
        default:
          calculatedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
      }
    }

    const reminder = new Reminder({
      userId: req.userId,
      title,
      type,
      time,
      enabled,
      frequency,
      daysOfWeek: calculatedDaysOfWeek,
      medication,
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC'
    });

    await reminder.save();

    console.log('[reminderPush] reminder created (server will fire at local time via scheduler)', {
      reminderId: String(reminder._id),
      userId: String(req.userId),
      time: reminder.time,
      timezone: reminder.timezone,
      frequency: reminder.frequency,
      enabled: reminder.enabled,
    });

    res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      reminder
    });
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reminder',
      error: error.message
    });
  }
};

/**
 * Get all reminders
 */
export const getAllReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({ userId: req.userId })
      .sort({ time: 1 });

    res.json({
      success: true,
      count: reminders.length,
      reminders
    });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reminders',
      error: error.message
    });
  }
};

/**
 * Get reminder by ID
 */
export const getReminderById = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    res.json({
      success: true,
      reminder
    });
  } catch (error) {
    console.error('Get reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reminder',
      error: error.message
    });
  }
};

/**
 * Update reminder
 */
export const updateReminder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    console.log('[reminderPush] reminder updated', {
      reminderId: String(reminder._id),
      userId: String(req.userId),
      time: reminder.time,
      timezone: reminder.timezone,
      frequency: reminder.frequency,
      enabled: reminder.enabled,
    });

    res.json({
      success: true,
      message: 'Reminder updated successfully',
      reminder
    });
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reminder',
      error: error.message
    });
  }
};

/**
 * Toggle reminder
 */
export const toggleReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    reminder.enabled = !reminder.enabled;
    await reminder.save();

    res.json({
      success: true,
      message: `Reminder ${reminder.enabled ? 'enabled' : 'disabled'}`,
      reminder
    });
  } catch (error) {
    console.error('Toggle reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle reminder',
      error: error.message
    });
  }
};

/**
 * Delete reminder
 */
export const deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    res.json({
      success: true,
      message: 'Reminder deleted successfully'
    });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reminder',
      error: error.message
    });
  }
};

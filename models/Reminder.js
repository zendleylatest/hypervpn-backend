import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['meal', 'medication', 'water', 'exercise', 'appointment']
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekdays', 'weekends', 'weekly', 'custom'],
    default: 'daily'
  },
  time: {
    type: String,
    required: true,
    // Format: HH:MM (24-hour format)
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  // IANA timezone for server-side push (e.g. Asia/Karachi). Used to fire at local wall time.
  timezone: {
    type: String,
    default: 'UTC',
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  daysOfWeek: [{
    type: Number,
    min: 0, // Sunday
    max: 6  // Saturday
  }],
  // For medication reminders
  medication: {
    name: String,
    dosage: String
  },
  // Last triggered time
  lastTriggered: Date,
  // Next scheduled time
  nextTrigger: Date
}, {
  timestamps: true
});

// Index for efficient queries
reminderSchema.index({ userId: 1, enabled: 1 });
reminderSchema.index({ userId: 1, time: 1 });

export default mongoose.model('Reminder', reminderSchema);

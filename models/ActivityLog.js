import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityType: {
    type: String,
    required: true,
    enum: ['Walking', 'Running', 'Cycling', 'Swimming', 'Gym', 'Yoga', 'Other']
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 1
  },
  caloriesBurned: {
    type: Number,
    required: true,
    min: 0
  },
  notes: String,
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
activityLogSchema.index({ userId: 1, date: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
